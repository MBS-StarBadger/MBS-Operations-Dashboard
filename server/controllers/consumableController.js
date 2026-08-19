const consumableRepository = require('../repositories/consumableRepository');

async function listConsumables(req, res) {
  const consumables = await consumableRepository.findAll();
  res.json(consumables);
}

async function createConsumable(req, res) {
  const { name, quantity, low_at, notes } = req.body;

  const consumable = await consumableRepository.insert({
    name,
    quantity: parseInt(quantity) || 0,
    low_at: parseInt(low_at) || 2,
    notes: notes || '',
  });

  res.json(consumable);
}

async function updateConsumable(req, res) {
  const { name, quantity, low_at, notes } = req.body;

  const consumable = await consumableRepository.update(req.params.id, {
    name,
    quantity: parseInt(quantity) || 0,
    low_at: parseInt(low_at) || 2,
    notes: notes || '',
  });

  res.json(consumable);
}

async function deleteConsumable(req, res) {
  await consumableRepository.deleteById(req.params.id);
  res.json({ success: true });
}

module.exports = {
  listConsumables,
  createConsumable,
  updateConsumable,
  deleteConsumable,
};
