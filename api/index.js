const { handleApi } = require("../server");

async function handler(req, res) {
  return handleApi(req, res);
}

handler.config = {
  maxDuration: 30
};

module.exports = handler;
