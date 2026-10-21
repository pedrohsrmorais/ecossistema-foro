const communityService = require('../services/community.service');

// ─── Tenant (módulo "comunidade") ──────────────────────────────────────────

async function listFeed(req, res) {
  const posts = await communityService.listFeed(req.account.id);
  res.json({ posts });
}

async function createPost(req, res) {
  const post = await communityService.createPost(req.account.id, req.user.id, req.body.content);
  res.status(201).json({ post });
}

async function deletePost(req, res) {
  await communityService.deletePost(req.params.id, req.account.id, req.user.id, req.user.role === 'admin');
  res.status(204).send();
}

async function leaderboard(req, res) {
  const ranking = await communityService.leaderboard(req.account.id);
  res.json({ ranking: ranking.map(r => ({ ...r, is_mine: r.account_id === req.account.id })) });
}

// ─── Moderação (admin da plataforma) ───────────────────────────────────────

async function adminListRecentPosts(req, res) {
  const posts = await communityService.adminListRecentPosts();
  res.json({ posts });
}

async function adminDeletePost(req, res) {
  await communityService.adminDeletePost(req.params.id);
  res.status(204).send();
}

module.exports = { listFeed, createPost, deletePost, leaderboard, adminListRecentPosts, adminDeletePost };
