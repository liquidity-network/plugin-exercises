Interactive exercises in a gitbook
==============

With this plugin, a book can contain interactive exercises (currently only in Javascript). An exercise is a code challenge provided to the reader, who is given a code editor to write a solution which is checked against the book author's validation code.

## How to use it?

To use the exercises plugin in your Gitbook project, add the `exercises` plugin to the `book.json` file, then install plugins using `gitbook install`.

```
{
    "plugins": ["exercises@https://github.com/thibmeu/plugin-exercises.git"]
}
```

## Exercises format

An exercise is defined by 4 simple parts:

* Exercise **Message**/Goals (in markdown/text)
* **Hints** message, to help the user if needed
* **Initial** code to show to the user, providing a starting point
* **Solution** code, being a correct solution to the exercise
* **Validation** code that tests the correctness of the user's input
* **Context** (optional) code evaluated before executing the user's solution

```solidity
{% exercise %}
Complete the simplestore contract by storing `_value` on `set()` and retrieving it on `get()`

{% hints %}
You can have a look on [Solidity Documentation](https://solidity.readthedocs.org)

{% initial %}
pragma solidity ^0.4.24;
contract SimpleStore {
  function set(uint _value) public {
    value = ;
  }

  function get() public view returns (uint) {
    return ;
  }

  uint value;
}

{% solution %}
pragma solidity ^0.4.24;
contract SimpleStore {
  function set(uint _value) public {
    value = _value;
  }

  function get() public view returns (uint) {
    return value;
  }

  uint private value;
}

{% validation %}
pragma solidity ^0.4.24;

import 'Assert.sol';
// The name matches the one of the solution
import 'SimpleStore.sol';

contract TestSimpleStore {

    // __ADDRESS__ does not serve any purpose within the new system
    SimpleStore simpleStore = SimpleStore(__ADDRESS__);

    // One Assert per function only
    function testValue() public {
        simpleStore.set(42);
        bytes32 result = simpleStore.get();
        bytes32 expect = 42;
        Assert.equal(result, expect, "The result is not the on expected");
    }

    // Don't forget to put this Event in your contract, it is used to retrieve the results
    event TestEvent(bool indexed result, string message);
}
{% endexercise %}
```

**The old format (`gitbook < 2.0.0`) is no longer supported.**
