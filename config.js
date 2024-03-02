const pathResolve = require('path').resolve;

module.exports = {
    ASSETS_DIR: pathResolve(process.cwd(), 'assets'),
    CDN_HTTPS_SERVER_PORT: 28043,
    HTTPS_PROXY_SERVER_PORT: 15280,
    SSL_CERT: pathResolve(__dirname, 'cdn-studio-prod.pokemon.com.crt'),
    SSL_KEY: pathResolve(__dirname, 'cdn-studio-prod.pokemon.com.key'),
};
