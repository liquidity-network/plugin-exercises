const assert = require('assert')
const tester = require('gitbook-tester')

describe('Gitbook integration test', function () {
  it('should create book and parse content', function (done) {
    tester.builder()
      .withContent('#test me \n\n![preview](preview.jpg)')
      .create()
      .then(function (result) {
        assert.equal(result[0].content, '<h1 id="test-me">test me</h1>\n<p><img src="preview.jpg" alt="preview"></p>')
        done()
      }).catch((err) => {
        console.log(err.toString())
        done()
      })
  })
})
