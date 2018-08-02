const Web3 = require('web3')

/**
 * Add a prepending 0x to a string if it doesn't have one
 * @returns {string} - Hexadecimal string with a valid format
 */
const sanitize = (hex) => {
  return hex.startsWith('0x') ? hex : `0x${hex}`
}

let web3 = new Web3(process.env.BLOCKCHAIN_PROVIDER)

const PRIVATE_KEY = sanitize(process.env.PRIVATE_KEY)
web3.eth.accounts.wallet.add(PRIVATE_KEY)

module.exports = {
  /**
   * Deploy a given contract using the account registered in web3
   * @param {{interface: string, bytecode: string}} contract - contract to deploy
   * @returns {Promise<string>} - address of the deployed contract
   */
  deploy: contract => {
    const abi = contract.interface
    const bc = sanitize(contract.bytecode)

    const mContract = new web3.eth.Contract(JSON.parse(abi))

    return new Promise((resolve) => {
      mContract.deploy({
        data: bc,
        arguments: []
      }).estimateGas({
        from: web3.eth.accounts.wallet[0].address
      }).then(async (gasAmount) => {
        console.log(JSON.stringify(contract))
        await (new Promise(res => { setTimeout(res, 1000) }))
        let gasPrice = await web3.eth.getGasPrice()
        return mContract.deploy({
          data: bc,
          arguments: []
        }).send({
          from: web3.eth.accounts.wallet[0].address,
          gas: gasAmount,
          gasPrice: gasPrice
        })
      }).then((dContract) => {
        console.log(dContract.options.address, JSON.stringify(bc))
        resolve(dContract.options.address)
      })
    })
  },
  sanitize: sanitize
}
