const ganache = require('ganache-cli')

// !!! DON'T USE THIS KEY ELSEWHERE !!!
const privateKey = '0x829778f9e59981e5893622d145615b38054a24b0439833879c67999f7c623e98'
const port = 9545
const server = ganache.server({
  accounts: [{
    balance: 0x200000000000000000000000000000000000000000000000000000000000000,
    secretKey: privateKey
  }],
  port: port
})

module.exports = {
  privateKey: privateKey,
  port: port,
  address: `ws://localhost:${port}`,
  listen: () => { server.listen(port) },
  close: () => { server.close() }
}
