/**
 * 013 — Quadros personalizáveis (estilo Monday): cada escritório cria seus próprios quadros com colunas tipadas,
 * grupos e itens. Os valores das células ficam em board_items.vals (JSON { coluna_id: valor }).
 */
module.exports.up = async function up(db) {
  const T = 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';
  await db.run(`CREATE TABLE IF NOT EXISTS boards (
    id          VARCHAR(36)  NOT NULL DEFAULT (UUID()),
    account_id  VARCHAR(36)  NOT NULL,
    name        VARCHAR(120) NOT NULL,
    description VARCHAR(500) NULL,
    color       VARCHAR(20)  NOT NULL DEFAULT 'blue',
    position    INT          NOT NULL DEFAULT 0,
    created_by  VARCHAR(36)  NULL,
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at  DATETIME     NULL,
    PRIMARY KEY (id),
    KEY idx_boards_account (account_id, deleted_at, position)
  ) ${T}`);
  await db.run(`CREATE TABLE IF NOT EXISTS board_columns (
    id         VARCHAR(36) NOT NULL DEFAULT (UUID()),
    board_id   VARCHAR(36) NOT NULL,
    account_id VARCHAR(36) NOT NULL,
    name       VARCHAR(80) NOT NULL,
    type       VARCHAR(20) NOT NULL DEFAULT 'text' COMMENT 'text|number|status|date|person|checkbox|link|lead|case',
    settings   JSON        NULL COMMENT 'status: { options: [{ id, label, color }] }',
    position   INT         NOT NULL DEFAULT 0,
    created_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_bcol_board (board_id, position)
  ) ${T}`);
  await db.run(`CREATE TABLE IF NOT EXISTS board_groups (
    id         VARCHAR(36) NOT NULL DEFAULT (UUID()),
    board_id   VARCHAR(36) NOT NULL,
    account_id VARCHAR(36) NOT NULL,
    name       VARCHAR(80) NOT NULL,
    color      VARCHAR(20) NOT NULL DEFAULT 'blue',
    position   INT         NOT NULL DEFAULT 0,
    created_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_bgrp_board (board_id, position)
  ) ${T}`);
  await db.run(`CREATE TABLE IF NOT EXISTS board_items (
    id         VARCHAR(36)  NOT NULL DEFAULT (UUID()),
    board_id   VARCHAR(36)  NOT NULL,
    account_id VARCHAR(36)  NOT NULL,
    group_id   VARCHAR(36)  NOT NULL,
    name       VARCHAR(255) NOT NULL,
    vals       JSON         NULL,
    position   INT          NOT NULL DEFAULT 0,
    created_by VARCHAR(36)  NULL,
    created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at DATETIME     NULL,
    PRIMARY KEY (id),
    KEY idx_bitem_board (board_id, deleted_at, group_id, position)
  ) ${T}`);
};
