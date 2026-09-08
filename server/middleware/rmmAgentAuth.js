const crypto = require('crypto');
const rmmRepository = require('../repositories/rmmRepository');

async function rmmAgentAuth(req, res, next) {
  try {
    const agentId = String(req.headers['x-rmm-agent-id'] || '').trim();
    const token = String(req.headers['x-rmm-agent-token'] || '').trim();

    if (!agentId || !token) {
      return res.status(401).json({
        error: 'Agent credentials required',
      });
    }

    const device = await rmmRepository.findByAgentId(agentId);

    if (!device || !device.agent_token_hash) {
      return res.status(401).json({
        error: 'Invalid agent credentials',
      });
    }

    const suppliedHash = crypto
      .createHash('sha256')
      .update(token)
      .digest();

    const storedHash = Buffer.from(device.agent_token_hash, 'hex');

    if (
      storedHash.length !== suppliedHash.length ||
      !crypto.timingSafeEqual(storedHash, suppliedHash)
    ) {
      return res.status(401).json({
        error: 'Invalid agent credentials',
      });
    }

    req.rmmDevice = device;
    next();
  } catch (error) {
    console.error('RMM agent authentication failed:', error);

    return res.status(500).json({
      error: 'Unable to authenticate RMM agent',
    });
  }
}

module.exports = rmmAgentAuth;
