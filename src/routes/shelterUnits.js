'use strict';

const express = require('express');
const store = require('../data/store');
const { authRequired, requireRole } = require('../auth');
const { sendError, isNonEmptyString, toPositiveInt } = require('../utils/http');

const router = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const VALID_TYPES = ['RESIDENTIAL', 'ENTERPRISE', 'SCHOOL', 'HOSPITAL', 'OTHER'];
const VALID_STATUS = ['ACTIVE', 'INACTIVE'];

router.use(authRequired);

router.get('/', wrap(async (req, res) => {
  const { district, keyword, status } = req.query;
  const filters = {};
  if (isNonEmptyString(district)) filters.district = district.trim();
  if (isNonEmptyString(keyword)) filters.keyword = keyword.trim();
  if (status !== undefined) {
    if (!VALID_STATUS.includes(status)) return sendError(res, 400, '无效的状态');
    filters.status = status;
  }
  const list = await store.listShelterUnits(filters);
  res.json({ data: list, total: list.length });
}));

router.get('/:id', wrap(async (req, res) => {
  const id = toPositiveInt(req.params.id);
  if (id === null) return sendError(res, 400, '无效的单元 ID');
  const u = await store.getShelterUnit(id);
  if (!u) return sendError(res, 404, '待掩蔽单元不存在');
  res.json({ data: u });
}));

router.post('/', requireRole('ADMIN', 'MANAGER'), wrap(async (req, res) => {
  const b = req.body || {};
  if (!isNonEmptyString(b.code)) return sendError(res, 400, '单元编号不能为空');
  if (!isNonEmptyString(b.name)) return sendError(res, 400, '单元名称不能为空');
  if (b.unitType !== undefined && !VALID_TYPES.includes(b.unitType)) {
    return sendError(res, 400, '无效的单元类型');
  }
  if (b.status !== undefined && !VALID_STATUS.includes(b.status)) {
    return sendError(res, 400, '无效的状态');
  }
  if (b.priority !== undefined && (!Number.isInteger(b.priority) || b.priority < 1 || b.priority > 100)) {
    return sendError(res, 400, '优先级必须是 1-100 之间的整数');
  }
  if (await store.findShelterUnitByCode(b.code.trim())) {
    return sendError(res, 409, '单元编号已存在');
  }
  const u = await store.createShelterUnit({ ...b, code: b.code.trim(), name: b.name.trim() });
  res.status(201).json({ data: u });
}));

router.put('/:id', requireRole('ADMIN', 'MANAGER'), wrap(async (req, res) => {
  const id = toPositiveInt(req.params.id);
  if (id === null) return sendError(res, 400, '无效的单元 ID');
  if (!(await store.getShelterUnit(id))) return sendError(res, 404, '待掩蔽单元不存在');
  const b = req.body || {};
  if (b.name !== undefined && !isNonEmptyString(b.name)) return sendError(res, 400, '单元名称不能为空');
  if (b.unitType !== undefined && !VALID_TYPES.includes(b.unitType)) {
    return sendError(res, 400, '无效的单元类型');
  }
  if (b.status !== undefined && !VALID_STATUS.includes(b.status)) {
    return sendError(res, 400, '无效的状态');
  }
  if (b.priority !== undefined && (!Number.isInteger(b.priority) || b.priority < 1 || b.priority > 100)) {
    return sendError(res, 400, '优先级必须是 1-100 之间的整数');
  }
  const updated = await store.updateShelterUnit(id, b);
  res.json({ data: updated });
}));

router.delete('/:id', requireRole('ADMIN'), wrap(async (req, res) => {
  const id = toPositiveInt(req.params.id);
  if (id === null) return sendError(res, 400, '无效的单元 ID');
  if (!(await store.getShelterUnit(id))) return sendError(res, 404, '待掩蔽单元不存在');
  await store.deleteShelterUnit(id);
  res.status(204).end();
}));

module.exports = router;
