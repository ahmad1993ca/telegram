// util/sleep.js

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  module.exports = sleep; // Export function using CommonJS
  