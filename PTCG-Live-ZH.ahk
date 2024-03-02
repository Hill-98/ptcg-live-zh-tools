;@Ahk2Exe-Let APP_NAME = PTCG-Live-ZH
;@Ahk2Exe-Let APP_VERSION = 1.3.0.0
;@Ahk2Exe-ExeName %U_APP_NAME%_%U_APP_VERSION%.exe
;@Ahk2Exe-SetCopyright Copyright © 2024 Hill-98@GitHub
;@Ahk2Exe-SetDescription %U_APP_NAME%
;@Ahk2Exe-SetMainIcon main.ico
;@Ahk2Exe-SetLanguage 0x0804
;@Ahk2Exe-SetName %U_APP_NAME%
;@Ahk2Exe-SetOrigFilename %U_APP_NAME%.exe
;@Ahk2Exe-SetProductName %U_APP_NAME%
;@Ahk2Exe-SetVersion %U_APP_VERSION%

#SingleInstance Force
#Include %A_ScriptDir%

RESOURCES_DIR := A_IsCompiled ? A_ScriptDir . "\resources" : A_ScriptDir

install_cert() {
    global RESOURCES_DIR

    path := RESOURCES_DIR . "\cdn-studio-prod.pokemon.com.crt"
    code := RunWait("certutil.exe -store root 3ad90f58")
    if (code != 0) {
        code := RunWait("*RunAs certutil.exe -f -addstore root `"" . path . "`"")
        if (code != 0) {
            return false
        }
    }
    return true
}

main_compiled() {
    global RESOURCES_DIR

    if (!DirExist(RESOURCES_DIR)) {
        DirCreate(RESOURCES_DIR)
    }

    try {
        self_version := FileGetVersion(A_ScriptFullPath)
    } catch Error {
        self_version := "new"
    }

    try {
        old_version := FileRead(RESOURCES_DIR . "\version")
    } catch Error {
        old_version := "old"
    }

    if (self_version != old_version) {
        try {
            FileWrite(RESOURCES_DIR . "\version", self_version)
        } catch Error {
        }
        try {
            FileWrite(A_ScriptDir . "\debug.bat", "@ECHO OFF`r`n.\resources\node.exe .\resources\start.js`r`nPAUSE > NUL")
        } catch Error {
        }
        FileInstall("cdn-studio-prod.pokemon.com.crt", RESOURCES_DIR . "\cdn-studio-prod.pokemon.com.crt", 1)
        FileInstall("cdn-studio-prod.pokemon.com.key", RESOURCES_DIR . "\cdn-studio-prod.pokemon.com.key", 1)
        FileInstall("config.js", RESOURCES_DIR . "\config.js", 1)
        FileInstall("https-proxy-server.js", RESOURCES_DIR . "\https-proxy-server.js", 1)
        FileInstall("start.js", RESOURCES_DIR . "\start.js", 1)
        FileInstall("node.exe", RESOURCES_DIR . "\node.exe", 1)
    }

    FileCreateShortcut(A_ScriptFullPath, A_Desktop . "\PTCG Live 汉化版.lnk", A_ScriptDir)
}

FileWrite(file, text) {
    if (FileExist(file)) {
        FileDelete(file)
    }
    FileAppend(text, file)
}

if (A_IsCompiled) {
    main_compiled()
}

if (!install_cert()) {
    MsgBox("SSL 证书安装失败，请尝试手动安装。", "PTCG Live 汉化版")
    Exit(2)
}

if (ProcessExist("Pokemon TCG Live.exe")) {
    MsgBox("检测到 Pokemon TCG Live 正在运行，请先关闭游戏再运行此程序。", "PTCG Live 汉化版")
    Exit(1)
}

try {
    Run("`"" . RESOURCES_DIR . "\node.exe`" `"" . RESOURCES_DIR . "\start.js`"", A_ScriptDir)
} catch Error {
    MsgBox("汉化脚本运行失败。")
}
