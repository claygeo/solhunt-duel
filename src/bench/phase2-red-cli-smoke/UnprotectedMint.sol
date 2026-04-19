// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract UnprotectedMint {
    mapping(address => uint256) public balances;
    uint256 public totalSupply;

    function mint(uint256 amount) external {
        // VULN: no access control; anyone can mint unlimited tokens
        balances[msg.sender] += amount;
        totalSupply += amount;
    }
}
