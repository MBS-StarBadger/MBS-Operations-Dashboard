const shirtRepository = require('../repositories/shirtRepository');

async function listShirts(req, res) {
  const shirts = await shirtRepository.findAll();
  res.json(shirts);
}

async function updateShirtQuantity(req, res) {
  const { quantity } = req.body;

  const shirt = await shirtRepository.updateQuantity(
    req.params.id,
    Math.max(0, parseInt(quantity) || 0)
  );

  res.json(shirt);
}

module.exports = {
  listShirts,
  updateShirtQuantity,
};
