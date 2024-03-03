#!/usr/bin/env node

const config = require('./config');
const events = require('events');
const fs = require('fs');
const https = require('https');
const net = require('net');
const path = require('path');

const clients = new Map();
const httpProxyServer = net.createServer();
const cdnHttpsServer = https.createServer({
    cert: fs.readFileSync(config.SSL_CERT),
    key: fs.readFileSync(config.SSL_KEY),
});

let CDN_CONTENTPATH = 'x';
// CDN_CONTENTPATH = '/rainier/Content/StandaloneWindows64/1.11.0';

/**
 * @param {string} name
 * @returns {string}
 */
const findCardAssets = function findCardAssets(name) {
    const dir = path.resolve(config.ASSETS_DIR, name);
    if (fs.existsSync(dir)) {
        const files = fs.readdirSync(dir, { recursive: true });
        const data = files.find((v) => v.endsWith('_data'));
        return data ? path.resolve(dir, data) : undefined;
    }
    return undefined;
};

/**
 * @param {?string} address
 * @param {?number} port
 * @returns {string}
 */
const formatRemote = function formatRemote(address, port) {
    const addr = address?.includes(':') ? `[${address}]` : address;
    return `${addr}:${port}`;
};

const responseToBuffer = function responseToBuffer(response, callback) {
    let buffer = Buffer.alloc(0);
    response.on('data', function responseToBufferOnData(chunk) {
        const buf = chunk instanceof Buffer ? chunk : Buffer.from(chunk);
        buffer = Buffer.concat([buffer, buf], buffer.length + buf.length);
    });
    response.on('end', function responseToBufferOnEnd() {
        callback(buffer);
    });
};

class ParseRequestError extends Error { }

class ProxyClient extends events {
    /** @type {net.Socket} */
    #socket = null;

    constructor(socket) {
        super();

        this.#socket = socket;
        socket.on('error', this.handleSocketError.bind(this));
        socket.once('close', this.handleSocketClose.bind(this));
        socket.on('data', this.handleSocketData.bind(this));

        this.on('error', this.handleError);
        this.on('request', this.handleReqest);

        console.log(`${this.remote} connected`);
    }

    get remote() {
        return formatRemote(this.#socket.remoteAddress, this.#socket.remotePort);
    }

    get socket() {
        return this.#socket;
    }

    /**
     * @param {Error} err 
     */
    handleError(err) {
        if (err instanceof ParseRequestError) {
            this.#socket.destroy();
        }
        console.error(this.remote, err);
    }

    /**
     * @param {Object<string, string>} headers
     * @param {String} host
     * @param {Number} port
     */
    handleReqest(headers, host, port) {
        const remote = formatRemote(host, port);
        const server = net.connect({
            host: host === 'cdn.studio-prod.pokemon.com' ? '127.0.0.1' : host,
            port: host === 'cdn.studio-prod.pokemon.com' ? config.CDN_HTTPS_SERVER_PORT : port,
            keepAlive: headers['Proxy-Connection'] === 'Keep-Alive',
            timeout: 60,
        });

        const timeoutTimer = setTimeout(() => {
            server.destroy();
            this.#socket.destroy();
        }, 30000);

        server.once('connect', () => {
            clearTimeout(timeoutTimer);
            this.#socket.write('HTTP/1.1 200 Connection Established\r\nProxy-agent: soga\r\n\r\n');
            console.log(`${remote} connected`);
            server.pipe(this.#socket);
            this.#socket.pipe(server);
        });

        server.on('error', (err) => {
            console.error(remote, err);
        });

        server.once('close', (handError) => {
            server.removeAllListeners();
            this.#socket.destroy();
            console.log(`${remote} disconnected (error: ${handError})`);
        });

        this.#socket.once('close', () => {
            server.destroy();
        });
    }

    handleSocketError(err) {
        console.error(this.remote, err);
    }

    handleSocketClose(handError) {
        this.#socket.removeAllListeners();
        this.removeAllListeners();

        console.log(`${this.remote} disconnected (error: ${handError})`);

        this.#socket.destroy();
    }

    handleSocketData(buffer) {
        /** @type {string} */
        const str = buffer.toString('utf8');
        if (str.startsWith('CONNECT')) {
            this.tryParseRequest(str);
        }
    }

    /**
     * @param {string} data
     */
    tryParseRequest(data) {
        const lines = data.split('\r\n');
        const firstLine = lines.shift();
        const firstLineStrs = firstLine.split(' ');
        if (!firstLine.startsWith('CONNECT ') || !firstLine.endsWith(' HTTP/1.1') || firstLineStrs.length !== 3) {
            this.emit('error', new ParseRequestError('This is not an HTTP 1.1/1.0 CONNECT request: ' + data,));
            return;
        }

        const remote = firstLineStrs[1];
        let remoteHost = '';
        let remotePort = 443;
        if (remote.startsWith('[')) {
            const index = remote.indexOf(']');
            if (index === -1) {
                this.emit('error', new ParseRequestError('This appears to be an illegal IPv6 address: ' + remote));
                return;
            }
            remoteHost = remote.substring(1, index);
            remotePort = remote.substring(index + 2);
            remotePort = Number.parseInt(remotePort === '' ? '443' : remotePort);
        } else {
            const strs = remote.split(':');
            remoteHost = strs[0];
            remotePort = Number.parseInt(strs[1] ?? '443');
        }

        const headers = {};
        lines.forEach((line) => {
            const index = line.indexOf(':');
            if (index === -1) {
                return;
            }
            const key = line.substring(0, index);
            const value = line.substring(index + 2);
            if (key.trim() === '' || value.trim() === '') {
                return;
            }
            headers[key] = value;
        });
        this.emit('request', headers, remoteHost, remotePort);
    }
}

cdnHttpsServer.on('request', (req, res) => {
    const handleReqest = function handleReqest() {
        const proxyRequest = https.request({
            family: 4,
            headers: {
                ...req.headers,
                Connection: 'Close',
            },
            host: req.headers.host,
            method: req.method,
            path: req.url,
            setHost: false,
            timeout: 1000,
        });

        if (typeof req.body !== 'undefined') {
            proxyRequest.write(req.body);
        }

        proxyRequest.on('error', (err) => {
            console.error(err);
            res.statusCode = 502;
            res.end();
        });

        proxyRequest.on('response', function handleProxyResponse(proxyResponse) {
            res.statusCode = proxyResponse.statusCode;
            for (const headerKey in proxyResponse.headers) {
                res.appendHeader(headerKey, proxyResponse.headers[headerKey]);
            }
            if (req.method.toUpperCase() === 'HEAD') {
                res.end();
                return;
            }

            if (req.method?.toUpperCase() === 'GET' && req.url?.startsWith(CDN_CONTENTPATH)) {
                const basename = path.basename(req.url);
                const assets = findCardAssets(basename);
                if (assets) {
                    try {
                        const data = fs.readFileSync(assets);
                        res.setHeader('content-length', data.length);
                        res.write(data);
                        console.log(basename, assets, req.url);
                    } catch (ex) {
                        console.error(ex);
                        res.statusCode = 204;
                        res.setHeader('content-length', '0');
                    }
                    res.end();
                    proxyRequest.destroy();
                    return;
                }
            }

            if (req.url.endsWith('/GameSettings.json')) {
                responseToBuffer(proxyResponse, (buffer) => {
                    try {
                        const json = JSON.parse(buffer.toString('utf8'));
                        CDN_CONTENTPATH = new URL(json.data.windowsplayer_contentpath).pathname;
                        console.log('CDN_CONTENTPATH: ' + CDN_CONTENTPATH);
                    } catch (ex) {
                        console.error(ex);
                    }
                    res.end(buffer);
                });
            } else {
                proxyResponse.pipe(res);
            }
        });

        proxyRequest.end();
    };

    if (typeof req.headers["content-length"] === 'string') {
        req.on('data', function rawBodyParserOnData(chunk) {
            if (typeof req.body === 'undefined') {
                req.body = Buffer.alloc(0);
            }
            const buf = chunk instanceof Buffer ? chunk : Buffer.from(chunk);
            req.body = Buffer.concat([req.body, buf], req.body.length + buf.length);
        });
        req.on('end', function rawBodyParserOnEnd() {
            handleReqest();
        });
    } else {
        handleReqest();
    }
});

httpProxyServer.on('connection', (socket) => {
    const client = new ProxyClient(socket);

    clients.set(client.remote, client);
    socket.once('close', () => {
        clients.delete(client.remote);
    });
});

cdnHttpsServer.listen(config.CDN_HTTPS_SERVER_PORT);
httpProxyServer.listen(config.HTTPS_PROXY_SERVER_PORT);
