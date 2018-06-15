const assert = require('assert')
const fs = require('fs')
const path = require('path')
const server = require('../src/js/utils/server')
const solc = require('solc')
const Web3 = require('web3')

describe('Blockchain interaction unit test', function () {
  let blockchain
  let web3
  it('should deploy a contract with public variables', async function () {
    // Compile the code with solc
    const code = solc.compile(
      fs.readFileSync(path.resolve(__dirname, './sol/Test_atomic_types.sol')).toString()
    )

    // Select the compiled contract
    const contract = code.contracts[':Test']
    // Deploy it
    const address = await blockchain.deploy(contract)

    // Create an instance of the compiled contract at the address it has been deployed
    const deployed = new web3.eth.Contract(JSON.parse(contract.interface), address)

    assert.strictEqual(await deployed.methods.varUint().call(), '0')
  })

  it('should not deploy a contract with a private variable and a getter', async function () {
    const code = solc.compile('pragma solidity ^0.4.0; contract Test { uint private x = 0; function y () view public returns (uint) { return x; } }')
    const contract = code.contracts[':Test']
    const address = await blockchain.deploy(contract)
    const deployed = new web3.eth.Contract(JSON.parse(contract.interface), address)

    assert.strictEqual(await deployed.methods.y().call(), '0')
  })

  it('should not deploy a contract with a private variable and a getter', async function () {
    const code = solc.compile('pragma solidity ^0.4.0; contract Test { uint private x = 0; function y () view public returns (uint) { return x; } }')
    const contract = code.contracts[':Test']
    const address = await blockchain.deploy(contract)
    const deployed = new web3.eth.Contract(JSON.parse(contract.interface), address)

    assert.strictEqual(await deployed.methods.y().call(), '0')
  })

  it('should prepend 0x to an hexadecimal string if not present', function () {
    const hex = '123'
    assert.ok(blockchain.sanitize(hex), '0x123')
  })

  it('should not modify an hexadecimal string if it starts with 0x', function () {
    const hex = '0x123'
    assert.ok(blockchain.sanitize(hex), '0x123')
  })

  before(function () {
    process.env.BLOCKCHAIN_PROVIDER = server.address
    process.env.PRIVATE_KEY = server.privateKey

    server.listen()
    blockchain = require('../src/js/exercise/blockchain')
    web3 = new Web3(server.address)
    web3.eth.accounts.wallet.add(server.privateKey)
  })

  after(function () {
    server.close()
  })
})
