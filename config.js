const join = require('path').join;

module.exports = {
    ASSETS_DIR: join(process.cwd(), 'assets'),
    CDN_HTTPS_SERVER_PORT: 28043,
    HTTPS_PROXY_SERVER_PORT: 15280,
    SSL_CERT: join(__dirname, 'cdn-studio-prod.pokemon.com.crt'),
    SSL_KEY: join(__dirname, 'cdn-studio-prod.pokemon.com.key'),
};
