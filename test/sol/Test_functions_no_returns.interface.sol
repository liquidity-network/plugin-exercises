pragma solidity ^0.4.24;
interface Test {
function defaultFunction () external ;
function externalFunction () external ;
function publicFunction () external ;
function pureExternalFunction () pure external ;
function pureFunction () pure external ;
function viewFunction () view external ;
}
