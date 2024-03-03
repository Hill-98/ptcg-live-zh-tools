#!/usr/bin/env node

const { spawn, spawnSync } = require('child_process');
const config = require('./config');
const fs = require('fs');
const os = require('os');
const path = require('path');

if (!fs.existsSync(config.ASSETS_DIR)) {
    console.log(`找不到 assets 文件夹 (${config.ASSETS_DIR})\n\n请下载 assets-*.zip 并解压至汉化工具目录 (${path.dirname(config.ASSETS_DIR)})\n\n或手动将 Kuyo 汉化包文件放至 assets 文件夹。`);
    process.stdin.read();
    return;
}

let ptcgLive = 'Pokemon TCG Live.exe';
try {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ptcg-live-zh"));
    spawnSync('powershell.exe', [
        '-NoLogo',
        '-NoProfile',
        '-ExecutionPolicy',
        'RemoteSigned',
        '-Command',
        'using namespace Microsoft.Win32; Add-Type -AssemblyName mscorlib; [Registry]::LocalMachine.OpenSubKey("SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{CF1C9860-7621-43C3-AA53-13A95631CBED}").GetValue("InstallLocation") | Out-File -Encoding UTF8 InstallLocation'
    ], { cwd: tempDir });
    const installLocation = path.join(tempDir, 'InstallLocation');
    if (fs.existsSync(installLocation)) {
        ptcgLive = path.join(fs.readFileSync(installLocation, { encoding: 'utf8' }).trim(), 'Pokémon Trading Card Game Live\\Pokemon TCG Live.exe');
    }
    fs.rmSync(tempDir, { force: true, recursive: true });
} catch (ex) {
    console.error(ex);
}

if (!fs.existsSync(ptcgLive)) {
    console.log('找不到 Pokémon TCG Live 可执行文件路径，请尝试使用安装包重新安装游戏。');
    process.stdin.read();
    return;
}

try {
    require('./https-proxy-server').start()
        .then(() => {
            spawn(ptcgLive, {
                env: {
                    ...process.env,
                    HTTPS_PROXY: 'http://127.0.0.1:' + config.HTTPS_PROXY_SERVER_PORT,
                    NO_PROXY: 'access.pokemon.com, insights-collector.newrelic.com',
                },
            }).on('close', () => {
                process.exit();
            }).on('error', (err) => {
                console.error('Pokémon TCG Live 启动失败', err);
                process.stdin.read();
            });
        })
        .catch((err) => {
            console.error('脚本初始化失败', err);
            process.stdin.read();
        });
} catch (ex) {
    console.error('脚本初始化失败', ex);
    process.stdin.read();
}

