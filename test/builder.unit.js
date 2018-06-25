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

  it('should ignore constructor while creating the interface', function () {
    const code = solc.compile(
      fs.readFileSync(path.resolve(__dirname, './sol/Test_contract_with_constructor.sol')).toString()
    )

    let interfaces = builder.createInterfaces(code)
    assert.equal(interfaces.length, 1)
    assert.equal(interfaces[0].name, 'Test')
    assert.equal(
      interfaces[0].code,
      fs.readFileSync(path.resolve(__dirname, './sol/Test_contract_with_constructor.interface.sol')).toString().trim()
    )
  })

  it('should create a matching function in the interface', function () {
    const code = solc.compile(
      fs.readFileSync(path.resolve(__dirname, './sol/Test_functions_no_returns.sol')).toString()
    )

    let interfaces = builder.createInterfaces(code)
    assert.equal(interfaces.length, 1)
    assert.equal(interfaces[0].name, 'Test')
    assert.equal(
      interfaces[0].code,
      fs.readFileSync(path.resolve(__dirname, './sol/Test_functions_no_returns.interface.sol')).toString().trim()
    )
  })

  it('should create a matching event in the interface', function () {
    const code = solc.compile(
      fs.readFileSync(path.resolve(__dirname, './sol/Test_events.sol')).toString()
    )

    let interfaces = builder.createInterfaces(code)
    assert.equal(interfaces.length, 1)
    assert.equal(interfaces[0].name, 'Test')
    assert.equal(
      interfaces[0].code,
      fs.readFileSync(path.resolve(__dirname, './sol/Test_events.interface.sol')).toString().trim()
    )
  })
})
