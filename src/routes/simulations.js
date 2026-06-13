'use strict';

const express = require('express');
const store = require('../data/store');
const { authRequired, requireRole } = require('../auth');
const { sendError, isNonEmptyString, toPositiveInt } = require('../utils/http');

const router = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const VALID_STATUS = ['DRAFT', 'RUNNING', 'COMPLETED', 'FAILED'];

router.use(authRequired);

router.get('/', wrap(async (req, res) => {
  const { district, status, keyword } = req.query;
  const filters = {};
  if (isNonEmptyString(district)) filters.district = district.trim();
  if (isNonEmptyString(keyword)) filters.keyword = keyword.trim();
  if (status !== undefined) {
    if (!VALID_STATUS.includes(status)) return sendError(res, 400, '无效的状态');
    filters.status = status;
  }
  const list = await store.listSimulationPlans(filters);
  res.json({ data: list, total: list.length });
}));

router.get('/stats/district', wrap(async (req, res) => {
  const { district } = req.query;
  const stats = await store.getDistrictShelterStats(
    isNonEmptyString(district) ? district.trim() : undefined
  );
  res.json({ data: stats });
}));

router.get('/:id', wrap(async (req, res) => {
  const id = toPositiveInt(req.params.id);
  if (id === null) return sendError(res, 400, '无效的方案 ID');
  const p = await store.getSimulationPlan(id);
  if (!p) return sendError(res, 404, '推演方案不存在');
  res.json({ data: p });
}));

router.get('/:id/summary', wrap(async (req, res) => {
  const id = toPositiveInt(req.params.id);
  if (id === null) return sendError(res, 400, '无效的方案 ID');
  if (!(await store.getSimulationPlan(id))) return sendError(res, 404, '推演方案不存在');
  const summary = await store.getSimulationSummary(id);
  if (!summary) return sendError(res, 404, '该方案尚未执行推演');
  res.json({ data: summary });
}));

router.get('/:id/allocations', wrap(async (req, res) => {
  const id = toPositiveInt(req.params.id);
  if (id === null) return sendError(res, 400, '无效的方案 ID');
  if (!(await store.getSimulationPlan(id))) return sendError(res, 404, '推演方案不存在');
  const allocations = await store.listAllocationResults(id);
  res.json({ data: allocations, total: allocations.length });
}));

router.post('/', requireRole('ADMIN', 'MANAGER'), wrap(async (req, res) => {
  const b = req.body || {};
  if (!isNonEmptyString(b.name)) return sendError(res, 400, '方案名称不能为空');
  if (b.perCapitaArea !== undefined && (typeof b.perCapitaArea !== 'number' || b.perCapitaArea <= 0)) {
    return sendError(res, 400, '人均掩蔽标准必须大于 0');
  }
  if (b.maxEvacuationDistance !== undefined && (!Number.isInteger(b.maxEvacuationDistance) || b.maxEvacuationDistance <= 0)) {
    return sendError(res, 400, '最远疏散距离必须是正整数');
  }
  if (b.status !== undefined && !VALID_STATUS.includes(b.status)) {
    return sendError(res, 400, '无效的状态');
  }
  if (b.excludedProjectIds !== undefined && !Array.isArray(b.excludedProjectIds)) {
    return sendError(res, 400, '排除工程ID必须是数组');
  }
  if (b.excludedUnitIds !== undefined && !Array.isArray(b.excludedUnitIds)) {
    return sendError(res, 400, '排除单元ID必须是数组');
  }
  const p = await store.createSimulationPlan({
    ...b,
    name: b.name.trim(),
    createdBy: req.user.id,
  });
  res.status(201).json({ data: p });
}));

router.post('/:id/execute', requireRole('ADMIN', 'MANAGER'), wrap(async (req, res) => {
  const id = toPositiveInt(req.params.id);
  if (id === null) return sendError(res, 400, '无效的方案 ID');
  const plan = await store.getSimulationPlan(id);
  if (!plan) return sendError(res, 404, '推演方案不存在');
  if (plan.status === 'RUNNING') return sendError(res, 409, '推演正在执行中，请稍候');

  try {
    const result = await store.executeSimulation(id, req.user.id);
    res.json({ data: result });
  } catch (err) {
    sendError(res, 500, '推演执行失败', { error: err.message });
  }
}));

router.post('/quick-run', requireRole('ADMIN', 'MANAGER'), wrap(async (req, res) => {
  const b = req.body || {};
  if (!isNonEmptyString(b.name)) return sendError(res, 400, '方案名称不能为空');
  if (b.perCapitaArea !== undefined && (typeof b.perCapitaArea !== 'number' || b.perCapitaArea <= 0)) {
    return sendError(res, 400, '人均掩蔽标准必须大于 0');
  }
  if (b.maxEvacuationDistance !== undefined && (!Number.isInteger(b.maxEvacuationDistance) || b.maxEvacuationDistance <= 0)) {
    return sendError(res, 400, '最远疏散距离必须是正整数');
  }
  if (b.excludedProjectIds !== undefined && !Array.isArray(b.excludedProjectIds)) {
    return sendError(res, 400, '排除工程ID必须是数组');
  }
  if (b.excludedUnitIds !== undefined && !Array.isArray(b.excludedUnitIds)) {
    return sendError(res, 400, '排除单元ID必须是数组');
  }

  const plan = await store.createSimulationPlan({
    ...b,
    name: b.name.trim(),
    status: 'DRAFT',
    createdBy: req.user.id,
  });

  try {
    const result = await store.executeSimulation(plan.id, req.user.id);
    res.json({ data: result });
  } catch (err) {
    sendError(res, 500, '推演执行失败', { error: err.message });
  }
}));

router.put('/:id', requireRole('ADMIN', 'MANAGER'), wrap(async (req, res) => {
  const id = toPositiveInt(req.params.id);
  if (id === null) return sendError(res, 400, '无效的方案 ID');
  if (!(await store.getSimulationPlan(id))) return sendError(res, 404, '推演方案不存在');
  const b = req.body || {};
  if (b.name !== undefined && !isNonEmptyString(b.name)) return sendError(res, 400, '方案名称不能为空');
  if (b.perCapitaArea !== undefined && (typeof b.perCapitaArea !== 'number' || b.perCapitaArea <= 0)) {
    return sendError(res, 400, '人均掩蔽标准必须大于 0');
  }
  if (b.maxEvacuationDistance !== undefined && (!Number.isInteger(b.maxEvacuationDistance) || b.maxEvacuationDistance <= 0)) {
    return sendError(res, 400, '最远疏散距离必须是正整数');
  }
  if (b.status !== undefined && !VALID_STATUS.includes(b.status)) {
    return sendError(res, 400, '无效的状态');
  }
  if (b.excludedProjectIds !== undefined && !Array.isArray(b.excludedProjectIds)) {
    return sendError(res, 400, '排除工程ID必须是数组');
  }
  if (b.excludedUnitIds !== undefined && !Array.isArray(b.excludedUnitIds)) {
    return sendError(res, 400, '排除单元ID必须是数组');
  }
  const updated = await store.updateSimulationPlan(id, b);
  res.json({ data: updated });
}));

router.delete('/:id', requireRole('ADMIN'), wrap(async (req, res) => {
  const id = toPositiveInt(req.params.id);
  if (id === null) return sendError(res, 400, '无效的方案 ID');
  if (!(await store.getSimulationPlan(id))) return sendError(res, 404, '推演方案不存在');
  await store.deleteSimulationPlan(id);
  res.status(204).end();
}));

module.exports = router;
