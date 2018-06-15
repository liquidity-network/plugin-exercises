const _ = require('lodash')
const fs = require('fs')
const path = require('path')
const deploy = require('./src/js/exercise/index')
const blockchain = require('./src/js/exercise/blockchain')
const solc = require('solc')

const WEBSITE_TPL = _.template(fs.readFileSync(path.resolve(__dirname, './assets/website.html')))
const EBOOK_TPL = _.template(fs.readFileSync(path.resolve(__dirname, './assets/ebook.html')))

const assertLibrary = fs.readFileSync(path.resolve(__dirname, './src/sol/Assert.sol'), 'utf8')

const isWriteMode = () => {
  return JSON.parse(process.env.WRITE_MODE)
}

async function deployAssertLibrary () {
  if (isWriteMode()) {
    return
  }
  const input = {
    'Assert.sol': assertLibrary
  }
  const codes = solc.compile({sources: input}, 1)
  this.config.values.variables.assertLibrary = await blockchain.deploy(codes.contracts['Assert.sol:Assert'])
}

/**
 * Manage all pre-operations necessary for the exercise to work
 * @param {{blocks: Array<{name: string, body: string}>}} blk - Information about the block being parsed
 * @returns {string} - HTML code to insert into the webpage
 */
async function processDeployement (blk) {
  const log = this.book.log

  const codes = {}

  _.each(blk.blocks, function (_blk) {
    codes[_blk.name] = _blk.body.trim()
  })

  // To have a quick update on local machine deployment can be disabled
  if (!isWriteMode()) {
    // Compile and deploy test contracts to our blockchain
    codes.deployed = await deploy(codes, { address: this.config.values.variables.assertLibrary, source: assertLibrary })
  } else {
    codes.exerciseId = -1
    codes.deployed = []
  }
  codes.deployed = JSON.stringify(codes.deployed)

  codes.hints = await this.book.renderBlock('markdown', '```solidity\n' + codes.solution + '\n```')

  // Select appropriate template
  const tpl = (this.generator === 'website' ? WEBSITE_TPL : EBOOK_TPL)

  let wording = await this.book.renderBlock('markdown', blk.body)
  wording = wording.replace('<p>', '').replace('</p>', '')

  return tpl({
    message: wording,
    codes: codes
  })
}

module.exports = {
  website: {
    assets: './assets',
    js: [
      'ace/ace.js',
      'ace/theme-tomorrow.js',
      'ace/mode-javascript.js',
      'dist/bundle.js',
      'dist/0.bundle.js'
    ],
    css: [
      'exercises.css',
      'hint.css'
    ]
  },
  ebook: {
    assets: './assets',
    css: [
      'ebook.css'
    ]
  },
  hooks: {
    init: deployAssertLibrary
  },
  blocks: {
    exercise: {
      parse: false,
      blocks: ['initial', 'solution', 'validation', 'context'],
      process: processDeployement
    }
  }
}
