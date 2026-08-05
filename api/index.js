const { handleApi } = require("../server");

module.exports = async function handler(req, res) {
  return handleApi(req, res);
};
