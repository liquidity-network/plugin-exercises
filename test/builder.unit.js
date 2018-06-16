const assert = require('assert')
const builder = require('../src/js/exercise/builder')
const fs = require('fs')
const path = require('path')
const solc = require('solc')

describe('Solidity Interface builder unit test', function () {
  it('should create an interface for state variable', function () {
    const code = solc.compile(
      fs.readFileSync(path.resolve(__dirname, './sol/Test_atomic_types.sol')).toString()
    )

    const contract = code.contracts[':Test']
    assert.equal(
      builder.parseSolidityJSON('Test', JSON.parse(contract.interface)),
      fs.readFileSync(path.resolve(__dirname, './sol/Test_atomic_types.interface.sol')).toString().trim()
    )
  })

  it('should find test contract and create an interface for state variable', function () {
    const code = solc.compile(
      fs.readFileSync(path.resolve(__dirname, './sol/Test_atomic_types.sol')).toString()
    )

    let interfaces = builder.createInterfaces(code)
    assert.equal(interfaces.length, 1)
    assert.equal(interfaces[0].name, 'Test')
    assert.equal(
      interfaces[0].code,
      fs.readFileSync(path.resolve(__dirname, './sol/Test_atomic_types.interface.sol')).toString().trim()
    )
  })
})
