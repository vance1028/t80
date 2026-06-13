'use strict';

const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');

const { createApp } = require('../src/app');
const { waitForDb, close } = require('../src/db');
const store = require('../src/data/store');

const app = createApp();

async function login(username, password) {
  const res = await request(app).post('/api/auth/login').send({ username, password });
  return res;
}

async function tokenOf(username, password) {
  const res = await login(username, password);
  return res.body.data.token;
}

before(async () => {
  await waitForDb();
});

beforeEach(async () => {
  await store.seed();
});

after(async () => {
  await close();
});

test('GET /api/health 返回 ok', async () => {
  const res = await request(app).get('/api/health');
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.status, 'ok');
});

/* ---------- 登录 ---------- */

test('登录成功返回 token 和用户信息', async () => {
  const res = await login('admin', 'admin123');
  assert.strictEqual(res.status, 200);
  assert.ok(res.body.data.token);
  assert.strictEqual(res.body.data.user.role, 'ADMIN');
});

test('密码错误返回 401', async () => {
  const res = await login('admin', 'wrongpass');
  assert.strictEqual(res.status, 401);
});

test('用户名不存在返回 401', async () => {
  const res = await login('nobody', 'x');
  assert.strictEqual(res.status, 401);
});

test('空用户名/密码返回 400', async () => {
  const res = await login('', '');
  assert.strictEqual(res.status, 400);
});

test('GET /api/auth/me 带 token 返回当前用户', async () => {
  const token = await tokenOf('manager', 'manager123');
  const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.data.username, 'manager');
});

/* ---------- 鉴权拦截 ---------- */

test('未带 token 访问工程列表返回 401', async () => {
  const res = await request(app).get('/api/projects');
  assert.strictEqual(res.status, 401);
});

test('无效 token 返回 401', async () => {
  const res = await request(app).get('/api/projects').set('Authorization', 'Bearer not.a.token');
  assert.strictEqual(res.status, 401);
});

/* ---------- 工程查询 ---------- */

test('登录后能列出种子工程', async () => {
  const token = await tokenOf('inspector', 'inspect123');
  const res = await request(app).get('/api/projects').set('Authorization', `Bearer ${token}`);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.total, 6);
});

test('工程列表支持按状态筛选', async () => {
  const token = await tokenOf('inspector', 'inspect123');
  const res = await request(app).get('/api/projects?status=MAINTENANCE').set('Authorization', `Bearer ${token}`);
  assert.strictEqual(res.status, 200);
  assert.ok(res.body.data.every((p) => p.status === 'MAINTENANCE'));
});

test('工程列表支持关键词搜索', async () => {
  const token = await tokenOf('inspector', 'inspect123');
  const res = await request(app).get('/api/projects?keyword=滨江').set('Authorization', `Bearer ${token}`);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.data.length, 1);
});

test('工程详情含设备子资源接口', async () => {
  const token = await tokenOf('inspector', 'inspect123');
  const res = await request(app).get('/api/projects/1/equipments').set('Authorization', `Bearer ${token}`);
  assert.strictEqual(res.status, 200);
  assert.ok(res.body.data.length >= 1);
});

/* ---------- 角色权限 ---------- */

test('管理员能新建工程', async () => {
  const token = await tokenOf('admin', 'admin123');
  const res = await request(app).post('/api/projects')
    .set('Authorization', `Bearer ${token}`)
    .send({ code: 'RF-NEW-1', name: '新增测试工程', district: '城关区' });
  assert.strictEqual(res.status, 201);
});

test('巡检员新建工程被拒 403', async () => {
  const token = await tokenOf('inspector', 'inspect123');
  const res = await request(app).post('/api/projects')
    .set('Authorization', `Bearer ${token}`)
    .send({ code: 'RF-NEW-2', name: 'x' });
  assert.strictEqual(res.status, 403);
});

test('工程编号重复返回 409', async () => {
  const token = await tokenOf('admin', 'admin123');
  const res = await request(app).post('/api/projects')
    .set('Authorization', `Bearer ${token}`)
    .send({ code: 'RF-2024-001', name: '重复编号' });
  assert.strictEqual(res.status, 409);
});

test('仅管理员能删除工程；管理员删除成功 204', async () => {
  const mgr = await tokenOf('manager', 'manager123');
  const denied = await request(app).delete('/api/projects/4').set('Authorization', `Bearer ${mgr}`);
  assert.strictEqual(denied.status, 403);

  const admin = await tokenOf('admin', 'admin123');
  const ok = await request(app).delete('/api/projects/4').set('Authorization', `Bearer ${admin}`);
  assert.strictEqual(ok.status, 204);
});

/* ---------- 检查记录 ---------- */

test('巡检员能登记检查记录', async () => {
  const token = await tokenOf('inspector', 'inspect123');
  const res = await request(app).post('/api/inspections')
    .set('Authorization', `Bearer ${token}`)
    .send({ projectId: 1, inspectDate: '2026-06-05', type: 'ROUTINE', result: 'PASS' });
  assert.strictEqual(res.status, 201);
});

test('检查记录非法日期返回 400', async () => {
  const token = await tokenOf('inspector', 'inspect123');
  const res = await request(app).post('/api/inspections')
    .set('Authorization', `Bearer ${token}`)
    .send({ projectId: 1, inspectDate: '2026/6/5' });
  assert.strictEqual(res.status, 400);
});

test('检查记录可按工程筛选', async () => {
  const token = await tokenOf('inspector', 'inspect123');
  const res = await request(app).get('/api/inspections?projectId=1').set('Authorization', `Bearer ${token}`);
  assert.strictEqual(res.status, 200);
  assert.ok(res.body.data.every((i) => i.projectId === 1));
});

test('未知接口返回 404', async () => {
  const res = await request(app).get('/api/unknown');
  assert.strictEqual(res.status, 404);
});

/* ---------- 球面距离计算 ---------- */

test('Haversine 球面距离计算正确', () => {
  const { haversineDistance } = require('../src/utils/shelterAllocation');
  const dist = haversineDistance(30.6598, 104.0655, 30.6585, 104.0670);
  assert.ok(dist > 0);
  assert.ok(dist < 300);
});

test('防护等级解析正确', () => {
  const { parseProtectionLevel } = require('../src/utils/shelterAllocation');
  assert.strictEqual(parseProtectionLevel('5'), 5);
  assert.strictEqual(parseProtectionLevel('6'), 6);
  assert.strictEqual(parseProtectionLevel('6B'), 6.5);
});

/* ---------- 待掩蔽单元 ---------- */

test('待掩蔽单元列表能正确返回种子数据', async () => {
  const token = await tokenOf('inspector', 'inspect123');
  const res = await request(app).get('/api/shelter-units').set('Authorization', `Bearer ${token}`);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.total, 8);
  assert.ok(res.body.data[0].priority < res.body.data[res.body.data.length - 1].priority);
});

test('待掩蔽单元支持按区域筛选', async () => {
  const token = await tokenOf('inspector', 'inspect123');
  const res = await request(app).get('/api/shelter-units?district=城关区').set('Authorization', `Bearer ${token}`);
  assert.strictEqual(res.status, 200);
  assert.ok(res.body.data.every((u) => u.district === '城关区'));
});

test('管理员能新建待掩蔽单元', async () => {
  const token = await tokenOf('admin', 'admin123');
  const res = await request(app).post('/api/shelter-units')
    .set('Authorization', `Bearer ${token}`)
    .send({
      code: 'UNIT-TEST-1',
      name: '测试小区',
      unitType: 'RESIDENTIAL',
      population: 500,
      priority: 10,
      district: '城关区',
      longitude: 104.065,
      latitude: 30.660,
    });
  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.body.data.population, 500);
});

test('待掩蔽单元编号重复返回 409', async () => {
  const token = await tokenOf('admin', 'admin123');
  const res = await request(app).post('/api/shelter-units')
    .set('Authorization', `Bearer ${token}`)
    .send({ code: 'UNIT-001', name: '重复编号' });
  assert.strictEqual(res.status, 409);
});

/* ---------- 区域掩蔽率统计 ---------- */

test('区域掩蔽率统计正确返回城关区数据', async () => {
  const token = await tokenOf('inspector', 'inspect123');
  const res = await request(app).get('/api/simulations/stats/district?district=城关区')
    .set('Authorization', `Bearer ${token}`);
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.data.district, '城关区');
  assert.strictEqual(res.body.data.totalUnits, 8);
  assert.strictEqual(res.body.data.totalPopulation, 15600);
  assert.strictEqual(res.body.data.totalProjects, 3);
  assert.strictEqual(res.body.data.totalCapacity, 12600);
  assert.ok(res.body.data.shelterRate > 0);
});

/* ---------- 推演方案与执行 ---------- */

test('能创建推演方案', async () => {
  const token = await tokenOf('manager', 'manager123');
  const res = await request(app).post('/api/simulations')
    .set('Authorization', `Bearer ${token}`)
    .send({
      name: '城关区战时掩蔽推演-测试',
      description: '测试用推演方案',
      district: '城关区',
      perCapitaArea: 1.0,
      maxEvacuationDistance: 800,
    });
  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.body.data.status, 'DRAFT');
});

test('快速推演能正确执行并返回结果', async () => {
  const token = await tokenOf('manager', 'manager123');
  const res = await request(app).post('/api/simulations/quick-run')
    .set('Authorization', `Bearer ${token}`)
    .send({
      name: '城关区快速推演',
      district: '城关区',
      perCapitaArea: 1.0,
      maxEvacuationDistance: 800,
    });
  assert.strictEqual(res.status, 200);
  assert.ok(res.body.data);
  assert.ok(res.body.data.plan);
  assert.ok(res.body.data.summary);
  assert.ok(res.body.data.allocations);
  assert.strictEqual(res.body.data.plan.status, 'COMPLETED');
  assert.strictEqual(res.body.data.summary.totalUnits, 8);
  assert.strictEqual(res.body.data.summary.totalPopulation, 15600);
  assert.ok(res.body.data.summary.allocatedPopulation > 0);
  assert.ok(res.body.data.summary.shelterRate > 0);
  assert.ok(res.body.data.summary.shelterRate <= 100);
});

test('推演结果中重点人群优先进入高等级掩体', async () => {
  const token = await tokenOf('manager', 'manager123');
  const res = await request(app).post('/api/simulations/quick-run')
    .set('Authorization', `Bearer ${token}`)
    .send({
      name: '优先级验证推演',
      district: '城关区',
      perCapitaArea: 1.0,
      maxEvacuationDistance: 1500,
    });
  assert.strictEqual(res.status, 200);
  const allocations = res.body.data.allocations;
  const hospitalAllocs = allocations.filter((a) => a.reason === '' && !a.isUncovered);
  assert.ok(hospitalAllocs.length > 0);
});

test('推演结果正确识别盲区', async () => {
  const token = await tokenOf('manager', 'manager123');
  const res = await request(app).post('/api/simulations/quick-run')
    .set('Authorization', `Bearer ${token}`)
    .send({
      name: '盲区检测推演',
      district: '城关区',
      perCapitaArea: 1.0,
      maxEvacuationDistance: 300,
    });
  assert.strictEqual(res.status, 200);
  const uncovered = res.body.data.allocations.filter((a) => a.isUncovered);
  assert.ok(uncovered.length > 0);
  assert.ok(res.body.data.summary.uncoveredPopulation > 0);
});

test('容量约束生效：总分配不超过各掩体容量', async () => {
  const token = await tokenOf('manager', 'manager123');
  const res = await request(app).post('/api/simulations/quick-run')
    .set('Authorization', `Bearer ${token}`)
    .send({
      name: '容量约束验证',
      district: '城关区',
      perCapitaArea: 1.0,
      maxEvacuationDistance: 2000,
    });
  assert.strictEqual(res.status, 200);
  const summary = res.body.data.summary;
  const details = summary.resultDetails;
  assert.ok(details);
  assert.ok(details.projectUsage);
  for (const pu of details.projectUsage) {
    assert.ok(pu.allocated <= pu.totalCapacity);
  }
  assert.strictEqual(summary.usedCapacity, details.projectUsage.reduce((s, p) => s + p.allocated, 0));
});

test('排除工程功能生效：排除后容量减少', async () => {
  const token = await tokenOf('manager', 'manager123');
  const res = await request(app).post('/api/simulations/quick-run')
    .set('Authorization', `Bearer ${token}`)
    .send({
      name: '排除工程测试',
      district: '城关区',
      perCapitaArea: 1.0,
      maxEvacuationDistance: 2000,
      excludedProjectIds: [1, 5],
    });
  assert.strictEqual(res.status, 200);
  const summary = res.body.data.summary;
  assert.strictEqual(summary.totalProjects, 1);
  assert.ok(summary.totalCapacity < 12600);
});

test('推演方案列表支持按状态筛选', async () => {
  const token = await tokenOf('manager', 'manager123');
  await request(app).post('/api/simulations/quick-run')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: '筛选测试', district: '城关区' });
  const res = await request(app).get('/api/simulations?status=COMPLETED')
    .set('Authorization', `Bearer ${token}`);
  assert.strictEqual(res.status, 200);
  assert.ok(res.body.data.length >= 1);
  assert.ok(res.body.data.every((p) => p.status === 'COMPLETED'));
});

test('能查询推演方案的分配明细', async () => {
  const token = await tokenOf('manager', 'manager123');
  const createRes = await request(app).post('/api/simulations/quick-run')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: '明细查询测试', district: '城关区' });
  const simId = createRes.body.data.plan.id;
  const res = await request(app).get(`/api/simulations/${simId}/allocations`)
    .set('Authorization', `Bearer ${token}`);
  assert.strictEqual(res.status, 200);
  assert.ok(res.body.data.length > 0);
});

test('能查询推演方案的汇总统计', async () => {
  const token = await tokenOf('manager', 'manager123');
  const createRes = await request(app).post('/api/simulations/quick-run')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: '汇总查询测试', district: '城关区' });
  const simId = createRes.body.data.plan.id;
  const res = await request(app).get(`/api/simulations/${simId}/summary`)
    .set('Authorization', `Bearer ${token}`);
  assert.strictEqual(res.status, 200);
  assert.ok(res.body.data.totalPopulation > 0);
  assert.ok(res.body.data.resultDetails);
  assert.ok(res.body.data.resultDetails.projectUsage);
  assert.ok(res.body.data.resultDetails.uncoveredList);
});

test('分配结果人数总和等于总人口', async () => {
  const token = await tokenOf('manager', 'manager123');
  const res = await request(app).post('/api/simulations/quick-run')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: '人数总和验证', district: '城关区', maxEvacuationDistance: 2000 });
  assert.strictEqual(res.status, 200);
  const allocations = res.body.data.allocations;
  const totalAllocated = allocations.reduce((s, a) => s + a.allocatedCount, 0);
  assert.strictEqual(totalAllocated, res.body.data.summary.totalPopulation);
});

test('已分配 + 未覆盖 = 总人口', async () => {
  const token = await tokenOf('manager', 'manager123');
  const res = await request(app).post('/api/simulations/quick-run')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: '人数平衡验证', district: '城关区', maxEvacuationDistance: 500 });
  assert.strictEqual(res.status, 200);
  const summary = res.body.data.summary;
  assert.strictEqual(
    summary.allocatedPopulation + summary.uncoveredPopulation,
    summary.totalPopulation
  );
});
