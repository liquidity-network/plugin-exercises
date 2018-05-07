const fs = require('fs')
const path = require('path')

const Web3 = require('web3')

const web3 = new Web3(process.env.BLOCKCHAIN_PROVIDER)

const PRIVATE_KEY = getPrivateKey()
web3.eth.accounts.wallet.add(PRIVATE_KEY)

/**
 * Retrieve the private key from a remote website
 * @dev It should be changed to a local retrieve
 * @returns {string} - Private key used to deploy tests
 */
function getPrivateKey () {
  if (process.env.PRIVATE_KEY.startsWith('0x')) {
    return process.env.PRIVATE_KEY
  }
  return '0x' + process.env.PRIVATE_KEY
}

module.exports = {
  /**
   * Deploy a given contract using the account registered in web3
   * @param {{interface: string, bytecode: string}} contract - contract to deploy
   * @returns {Promise<string>} - address of the deployed contract
   */
  deploy: contract => {
    const abi = contract.interface
    const bc = '0x' + contract.bytecode // web3 expect bytecode to be written in hexadecimal

    const mContract = new web3.eth.Contract(JSON.parse(abi))

    return new Promise(function (resolve) {
      mContract.deploy({
        data: bc,
        arguments: []
      }).estimateGas({
        from: web3.eth.accounts.wallet[0].address
      }).then(function (gasAmount) {
        return mContract.deploy({
          data: bc,
          arguments: []
        }).send({
          from: web3.eth.accounts.wallet[0].address,
          gas: gasAmount
        })
      }).then(function (dContract) {
        resolve(dContract.options.address)
      })
    })
  }
}
