'use strict';

/**
 * 数据仓储层 - 基于 MySQL（mysql2/promise）。
 * 所有方法 async，返回 camelCase 字段对象。
 */

const { pool } = require('../db');
const { hashPassword } = require('../utils/password');
const { allocateShelters } = require('../utils/shelterAllocation');

/* ----------------------------- 映射 ----------------------------- */

function mapUser(r) {
  if (!r) return null;
  return {
    id: r.id,
    username: r.username,
    name: r.name,
    role: r.role,
    department: r.department,
    status: r.status,
    createdAt: r.created_at,
  };
}

// 含密码哈希的内部映射，仅登录校验用，绝不直接返回给前端
function mapUserWithHash(r) {
  if (!r) return null;
  return { ...mapUser(r), passwordHash: r.password_hash };
}

function mapProject(r) {
  if (!r) return null;
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    type: r.type,
    protectionLevel: r.protection_level,
    areaSqm: Number(r.area_sqm),
    address: r.address,
    district: r.district,
    peacetimeUse: r.peacetime_use,
    status: r.status,
    completedAt: r.completed_at,
    shelterAreaSqm: Number(r.shelter_area_sqm),
    capacity: r.capacity,
    entranceCount: r.entrance_count,
    evacuationCapacity: r.evacuation_capacity,
    longitude: r.longitude != null ? Number(r.longitude) : null,
    latitude: r.latitude != null ? Number(r.latitude) : null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function mapEquipment(r) {
  if (!r) return null;
  return {
    id: r.id,
    projectId: r.project_id,
    name: r.name,
    category: r.category,
    model: r.model,
    installDate: r.install_date,
    status: r.status,
    createdAt: r.created_at,
  };
}

function mapInspection(r) {
  if (!r) return null;
  return {
    id: r.id,
    projectId: r.project_id,
    inspectorId: r.inspector_id,
    inspectDate: r.inspect_date,
    type: r.type,
    result: r.result,
    issues: r.issues,
    createdAt: r.created_at,
  };
}

function mapShelterUnit(r) {
  if (!r) return null;
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    unitType: r.unit_type,
    population: r.population,
    priority: r.priority,
    district: r.district,
    address: r.address,
    longitude: r.longitude != null ? Number(r.longitude) : null,
    latitude: r.latitude != null ? Number(r.latitude) : null,
    description: r.description,
    status: r.status,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function parseJsonField(v) {
  if (v == null) return null;
  if (typeof v === 'string') {
    try { return JSON.parse(v); } catch { return null; }
  }
  return v;
}

function mapSimulationPlan(r) {
  if (!r) return null;
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    district: r.district,
    bounds: parseJsonField(r.bounds),
    perCapitaArea: Number(r.per_capita_area),
    maxEvacuationDistance: r.max_evacuation_distance,
    excludedProjectIds: parseJsonField(r.excluded_project_ids) || [],
    excludedUnitIds: parseJsonField(r.excluded_unit_ids) || [],
    status: r.status,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function mapAllocationResult(r) {
  if (!r) return null;
  return {
    id: r.id,
    simulationId: r.simulation_id,
    shelterUnitId: r.shelter_unit_id,
    projectId: r.project_id,
    allocatedCount: r.allocated_count,
    distanceMeters: r.distance_meters != null ? Number(r.distance_meters) : null,
    walkMinutes: r.walk_minutes != null ? Number(r.walk_minutes) : null,
    isUncovered: !!r.is_uncovered,
    reason: r.reason,
    createdAt: r.created_at,
  };
}

function mapSimulationSummary(r) {
  if (!r) return null;
  return {
    id: r.id,
    simulationId: r.simulation_id,
    totalUnits: r.total_units,
    totalPopulation: r.total_population,
    allocatedPopulation: r.allocated_population,
    uncoveredPopulation: r.uncovered_population,
    shelterRate: Number(r.shelter_rate),
    totalProjects: r.total_projects,
    totalCapacity: r.total_capacity,
    usedCapacity: r.used_capacity,
    remainingCapacity: r.remaining_capacity,
    avgDistance: r.avg_distance != null ? Number(r.avg_distance) : null,
    maxDistance: r.max_distance != null ? Number(r.max_distance) : null,
    resultDetails: parseJsonField(r.result_details),
    createdAt: r.created_at,
  };
}

/* --------------------------- 初始化/重置 --------------------------- */

async function seed() {
  const conn = await pool.getConnection();
  try {
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const t of [
      'simulation_summaries', 'allocation_results', 'simulation_plans',
      'shelter_units', 'inspections', 'equipments', 'projects', 'users',
    ]) {
      await conn.query(`TRUNCATE TABLE ${t}`);
    }
    await conn.query('SET FOREIGN_KEY_CHECKS = 1');

    await conn.query(
      `INSERT INTO users (id, username, password_hash, name, role, department) VALUES
        (1, 'admin', ?, '系统管理员', 'ADMIN', '人防办信息科'),
        (2, 'manager', ?, '张管理', 'MANAGER', '工程管理科'),
        (3, 'inspector', ?, '李巡检', 'INSPECTOR', '维护管理科')`,
      [hashPassword('admin123'), hashPassword('manager123'), hashPassword('inspect123')],
    );

    await conn.query(
      `INSERT INTO projects (id, code, name, type, protection_level, area_sqm, address, district, peacetime_use, status, completed_at,
        shelter_area_sqm, capacity, entrance_count, evacuation_capacity, longitude, latitude) VALUES
        (1, 'RF-2024-001', '中心广场地下人防工程', 'COMBINED', '6', 8600.50, '人民中路1号地下', '城关区', '地下停车场', 'NORMAL', '2018-09-01',
         6000.00, 6000, 4, 120, 104.065500, 30.659800),
        (2, 'RF-2024-002', '滨江路防空地下室', 'BASEMENT', '6B', 3200.00, '滨江路88号', '江南区', '商业仓储', 'NORMAL', '2020-05-15',
         2500.00, 2500, 2, 80, 104.061200, 30.651200),
        (3, 'RF-2024-003', '老城区单建掘开式工程', 'SINGLE', '5', 5400.00, '解放街地下', '城关区', '暂未利用', 'MAINTENANCE', '2010-03-20',
         4500.00, 4500, 3, 100, 104.070200, 30.663500),
        (4, 'RF-2024-004', '科技园人员掩蔽所', 'SHELTER', '6', 2100.00, '科技大道12号地下', '高新区', '社区活动中心', 'NORMAL', '2021-11-30',
         1800.00, 1800, 2, 60, 104.058000, 30.667000),
        (5, 'RF-2024-005', '城关医院地下掩蔽所', 'SHELTER', '5', 3500.00, '健康路20号地下', '城关区', '医疗物资储备', 'NORMAL', '2019-12-10',
         3000.00, 3000, 3, 90, 104.068000, 30.656000),
        (6, 'RF-2024-006', '第一中学人防地下室', 'BASEMENT', '6', 4200.00, '学府路1号地下', '城关区', '学生活动中心', 'NORMAL', '2017-08-20',
         3600.00, 3600, 4, 110, 104.063000, 30.666000)`,
    );

    await conn.query(
      `INSERT INTO shelter_units (id, code, name, unit_type, population, priority, district, address, longitude, latitude, description) VALUES
        (1, 'UNIT-001', '中心花园小区', 'RESIDENTIAL', 2200, 10, '城关区', '人民中路8号', 104.067000, 30.658500, '大型成熟社区，常住人口2200人'),
        (2, 'UNIT-002', '城关区人民医院', 'HOSPITAL', 800, 1, '城关区', '健康路20号', 104.068200, 30.655800, '三级甲等医院，含医护人员和住院病人'),
        (3, 'UNIT-003', '第一中学', 'SCHOOL', 3500, 2, '城关区', '学府路1号', 104.062800, 30.666200, '省级重点中学，师生共3500人'),
        (4, 'UNIT-004', '解放街社区', 'RESIDENTIAL', 1800, 10, '城关区', '解放街15号', 104.071000, 30.662000, '老城区社区，常住人口1800人'),
        (5, 'UNIT-005', '城南家园', 'RESIDENTIAL', 2500, 10, '城关区', '滨江路120号', 104.060500, 30.650000, '新建住宅小区，常住人口2500人'),
        (6, 'UNIT-006', '市政务服务中心', 'ENTERPRISE', 1200, 5, '城关区', '人民中路2号', 104.064800, 30.660200, '行政服务中心，工作人员及办事群众约1200人'),
        (7, 'UNIT-007', '实验幼儿园', 'SCHOOL', 600, 2, '城关区', '学府路5号', 104.061500, 30.664500, '公立幼儿园，师生共600人'),
        (8, 'UNIT-008', '东大街商业区', 'ENTERPRISE', 3000, 10, '城关区', '东大街88号', 104.073000, 30.658000, '繁华商业区，从业人员及顾客约3000人')`,
    );

    await conn.query(
      `INSERT INTO equipments (project_id, name, category, model, install_date, status) VALUES
        (1, '1号防护密闭门', 'PROTECTIVE_DOOR', 'HFM2030', '2018-08-01', 'NORMAL'),
        (1, '战时通风机', 'VENTILATION', 'F300', '2018-08-10', 'NORMAL'),
        (1, '柴油发电机组', 'POWER', '50GF', '2018-08-15', 'NORMAL'),
        (2, '防爆波活门', 'PROTECTIVE_DOOR', 'HK600', '2020-04-20', 'NORMAL'),
        (2, '给排水泵', 'WATER', 'WQ15', '2020-05-01', 'FAULT'),
        (3, '滤毒通风设备', 'VENTILATION', 'LD60', '2010-03-01', 'MAINTENANCE')`,
    );

    await conn.query(
      `INSERT INTO inspections (project_id, inspector_id, inspect_date, type, result, issues) VALUES
        (1, 3, '2026-05-10', 'ROUTINE', 'PASS', ''),
        (2, 3, '2026-05-12', 'ROUTINE', 'FAIL', '给排水泵故障，需更换'),
        (3, 3, '2026-04-20', 'SPECIAL', 'FAIL', '滤毒设备老化，建议大修'),
        (1, 3, '2026-06-01', 'ROUTINE', 'PASS', '')`,
    );
  } finally {
    conn.release();
  }
}

async function isEmpty() {
  const [rows] = await pool.query('SELECT COUNT(*) AS cnt FROM users');
  return rows[0].cnt === 0;
}

/* ----------------------------- 用户 ----------------------------- */

async function findUserByUsername(username) {
  const [rows] = await pool.query('SELECT * FROM users WHERE username = ?', [username]);
  return mapUserWithHash(rows[0]);
}

async function getUser(id) {
  const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [id]);
  return mapUser(rows[0]);
}

async function listUsers() {
  const [rows] = await pool.query('SELECT * FROM users ORDER BY id');
  return rows.map(mapUser);
}

async function createUser({ username, password, name = '', role = 'INSPECTOR', department = '' }) {
  const [r] = await pool.query(
    'INSERT INTO users (username, password_hash, name, role, department) VALUES (?, ?, ?, ?, ?)',
    [username, hashPassword(password), name, role, department],
  );
  return getUser(r.insertId);
}

/* ----------------------------- 人防工程 ----------------------------- */

async function listProjects({ status, district, keyword } = {}) {
  const where = [];
  const params = [];
  if (status !== undefined) { where.push('status = ?'); params.push(status); }
  if (district !== undefined) { where.push('district = ?'); params.push(district); }
  if (keyword !== undefined && keyword !== '') {
    where.push('(name LIKE ? OR code LIKE ? OR address LIKE ?)');
    const like = `%${keyword}%`;
    params.push(like, like, like);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [rows] = await pool.query(`SELECT * FROM projects ${clause} ORDER BY id`, params);
  return rows.map(mapProject);
}

async function getProject(id) {
  const [rows] = await pool.query('SELECT * FROM projects WHERE id = ?', [id]);
  return mapProject(rows[0]);
}

async function findProjectByCode(code) {
  const [rows] = await pool.query('SELECT * FROM projects WHERE code = ?', [code]);
  return mapProject(rows[0]);
}

async function createProject(p) {
  const [r] = await pool.query(
    `INSERT INTO projects (code, name, type, protection_level, area_sqm, address, district, peacetime_use, status, completed_at,
      shelter_area_sqm, capacity, entrance_count, evacuation_capacity, longitude, latitude)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [p.code, p.name, p.type || 'COMBINED', p.protectionLevel || '6', p.areaSqm || 0,
     p.address || '', p.district || '', p.peacetimeUse || '', p.status || 'NORMAL', p.completedAt || null,
     p.shelterAreaSqm || 0, p.capacity || 0, p.entranceCount || 0, p.evacuationCapacity || 0,
     p.longitude != null ? Number(p.longitude) : null, p.latitude != null ? Number(p.latitude) : null],
  );
  return getProject(r.insertId);
}

async function updateProject(id, patch) {
  const map = {
    name: 'name', type: 'type', protectionLevel: 'protection_level', areaSqm: 'area_sqm',
    address: 'address', district: 'district', peacetimeUse: 'peacetime_use',
    status: 'status', completedAt: 'completed_at',
    shelterAreaSqm: 'shelter_area_sqm', capacity: 'capacity',
    entranceCount: 'entrance_count', evacuationCapacity: 'evacuation_capacity',
    longitude: 'longitude', latitude: 'latitude',
  };
  const sets = [];
  const params = [];
  for (const [k, col] of Object.entries(map)) {
    if (patch[k] !== undefined) {
      sets.push(`${col} = ?`);
      params.push((k === 'longitude' || k === 'latitude') && patch[k] != null ? Number(patch[k]) : patch[k]);
    }
  }
  if (sets.length) {
    sets.push('updated_at = CURRENT_TIMESTAMP(3)');
    params.push(id);
    await pool.query(`UPDATE projects SET ${sets.join(', ')} WHERE id = ?`, params);
  }
  return getProject(id);
}

async function deleteProject(id) {
  const [r] = await pool.query('DELETE FROM projects WHERE id = ?', [id]);
  return r.affectedRows > 0;
}

/* ----------------------------- 设备设施 ----------------------------- */

async function listEquipments(projectId) {
  const [rows] = await pool.query(
    'SELECT * FROM equipments WHERE project_id = ? ORDER BY id', [projectId]);
  return rows.map(mapEquipment);
}

async function createEquipment(e) {
  const [r] = await pool.query(
    `INSERT INTO equipments (project_id, name, category, model, install_date, status)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [e.projectId, e.name, e.category || 'OTHER', e.model || '', e.installDate || null, e.status || 'NORMAL'],
  );
  const [rows] = await pool.query('SELECT * FROM equipments WHERE id = ?', [r.insertId]);
  return mapEquipment(rows[0]);
}

/* ----------------------------- 检查记录 ----------------------------- */

async function listInspections({ projectId } = {}) {
  if (projectId !== undefined) {
    const [rows] = await pool.query(
      'SELECT * FROM inspections WHERE project_id = ? ORDER BY inspect_date DESC, id DESC', [projectId]);
    return rows.map(mapInspection);
  }
  const [rows] = await pool.query('SELECT * FROM inspections ORDER BY inspect_date DESC, id DESC');
  return rows.map(mapInspection);
}

async function createInspection(i) {
  const [r] = await pool.query(
    `INSERT INTO inspections (project_id, inspector_id, inspect_date, type, result, issues)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [i.projectId, i.inspectorId || null, i.inspectDate, i.type || 'ROUTINE', i.result || 'PASS', i.issues || ''],
  );
  const [rows] = await pool.query('SELECT * FROM inspections WHERE id = ?', [r.insertId]);
  return mapInspection(rows[0]);
}

/* ----------------------------- 待掩蔽单元 ----------------------------- */

async function listShelterUnits({ district, keyword, status } = {}) {
  const where = [];
  const params = [];
  if (district !== undefined) { where.push('district = ?'); params.push(district); }
  if (status !== undefined) { where.push('status = ?'); params.push(status); }
  if (keyword !== undefined && keyword !== '') {
    where.push('(name LIKE ? OR code LIKE ? OR address LIKE ?)');
    const like = `%${keyword}%`;
    params.push(like, like, like);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [rows] = await pool.query(`SELECT * FROM shelter_units ${clause} ORDER BY priority, id`, params);
  return rows.map(mapShelterUnit);
}

async function getShelterUnit(id) {
  const [rows] = await pool.query('SELECT * FROM shelter_units WHERE id = ?', [id]);
  return mapShelterUnit(rows[0]);
}

async function findShelterUnitByCode(code) {
  const [rows] = await pool.query('SELECT * FROM shelter_units WHERE code = ?', [code]);
  return mapShelterUnit(rows[0]);
}

async function createShelterUnit(u) {
  const [r] = await pool.query(
    `INSERT INTO shelter_units (code, name, unit_type, population, priority, district, address, longitude, latitude, description, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [u.code, u.name, u.unitType || 'RESIDENTIAL', u.population || 0, u.priority || 10,
     u.district || '', u.address || '',
     u.longitude != null ? Number(u.longitude) : null, u.latitude != null ? Number(u.latitude) : null,
     u.description || '', u.status || 'ACTIVE'],
  );
  return getShelterUnit(r.insertId);
}

async function updateShelterUnit(id, patch) {
  const map = {
    name: 'name', unitType: 'unit_type', population: 'population', priority: 'priority',
    district: 'district', address: 'address', longitude: 'longitude', latitude: 'latitude',
    description: 'description', status: 'status',
  };
  const sets = [];
  const params = [];
  for (const [k, col] of Object.entries(map)) {
    if (patch[k] !== undefined) {
      sets.push(`${col} = ?`);
      params.push((k === 'longitude' || k === 'latitude') && patch[k] != null ? Number(patch[k]) : patch[k]);
    }
  }
  if (sets.length) {
    sets.push('updated_at = CURRENT_TIMESTAMP(3)');
    params.push(id);
    await pool.query(`UPDATE shelter_units SET ${sets.join(', ')} WHERE id = ?`, params);
  }
  return getShelterUnit(id);
}

async function deleteShelterUnit(id) {
  const [r] = await pool.query('DELETE FROM shelter_units WHERE id = ?', [id]);
  return r.affectedRows > 0;
}

/* ----------------------------- 推演方案 ----------------------------- */

async function listSimulationPlans({ district, status, keyword } = {}) {
  const where = [];
  const params = [];
  if (district !== undefined && district !== '') { where.push('district = ?'); params.push(district); }
  if (status !== undefined) { where.push('status = ?'); params.push(status); }
  if (keyword !== undefined && keyword !== '') {
    where.push('(name LIKE ? OR description LIKE ?)');
    const like = `%${keyword}%`;
    params.push(like, like);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [rows] = await pool.query(`SELECT * FROM simulation_plans ${clause} ORDER BY id DESC`, params);
  return rows.map(mapSimulationPlan);
}

async function getSimulationPlan(id) {
  const [rows] = await pool.query('SELECT * FROM simulation_plans WHERE id = ?', [id]);
  return mapSimulationPlan(rows[0]);
}

async function createSimulationPlan(p) {
  const [r] = await pool.query(
    `INSERT INTO simulation_plans (name, description, district, bounds, per_capita_area, max_evacuation_distance,
      excluded_project_ids, excluded_unit_ids, status, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [p.name, p.description || '', p.district || '',
     p.bounds && p.bounds.length ? JSON.stringify(p.bounds) : null,
     p.perCapitaArea != null ? Number(p.perCapitaArea) : 1.0,
     p.maxEvacuationDistance || 800,
     p.excludedProjectIds && p.excludedProjectIds.length ? JSON.stringify(p.excludedProjectIds) : null,
     p.excludedUnitIds && p.excludedUnitIds.length ? JSON.stringify(p.excludedUnitIds) : null,
     p.status || 'DRAFT', p.createdBy || null],
  );
  return getSimulationPlan(r.insertId);
}

async function updateSimulationPlan(id, patch) {
  const map = {
    name: 'name', description: 'description', district: 'district',
    perCapitaArea: 'per_capita_area', maxEvacuationDistance: 'max_evacuation_distance',
    status: 'status',
  };
  const sets = [];
  const params = [];
  for (const [k, col] of Object.entries(map)) {
    if (patch[k] !== undefined) {
      sets.push(`${col} = ?`);
      params.push(patch[k]);
    }
  }
  if (patch.bounds !== undefined) {
    sets.push('bounds = ?');
    params.push(patch.bounds && patch.bounds.length ? JSON.stringify(patch.bounds) : null);
  }
  if (patch.excludedProjectIds !== undefined) {
    sets.push('excluded_project_ids = ?');
    params.push(patch.excludedProjectIds && patch.excludedProjectIds.length ? JSON.stringify(patch.excludedProjectIds) : null);
  }
  if (patch.excludedUnitIds !== undefined) {
    sets.push('excluded_unit_ids = ?');
    params.push(patch.excludedUnitIds && patch.excludedUnitIds.length ? JSON.stringify(patch.excludedUnitIds) : null);
  }
  if (sets.length) {
    sets.push('updated_at = CURRENT_TIMESTAMP(3)');
    params.push(id);
    await pool.query(`UPDATE simulation_plans SET ${sets.join(', ')} WHERE id = ?`, params);
  }
  return getSimulationPlan(id);
}

async function deleteSimulationPlan(id) {
  const [r] = await pool.query('DELETE FROM simulation_plans WHERE id = ?', [id]);
  return r.affectedRows > 0;
}

/* ----------------------------- 分配结果与推演统计 ----------------------------- */

async function listAllocationResults(simulationId) {
  const [rows] = await pool.query(
    'SELECT * FROM allocation_results WHERE simulation_id = ? ORDER BY is_uncovered DESC, id',
    [simulationId],
  );
  return rows.map(mapAllocationResult);
}

async function getSimulationSummary(simulationId) {
  const [rows] = await pool.query('SELECT * FROM simulation_summaries WHERE simulation_id = ?', [simulationId]);
  return mapSimulationSummary(rows[0]);
}

/* ----------------------------- 执行推演 ----------------------------- */

async function executeSimulation(planId, userId) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [planRows] = await conn.query('SELECT * FROM simulation_plans WHERE id = ? FOR UPDATE', [planId]);
    if (!planRows[0]) throw new Error('推演方案不存在');
    const plan = mapSimulationPlan(planRows[0]);

    await conn.query('UPDATE simulation_plans SET status = ? WHERE id = ?', ['RUNNING', planId]);

    const unitWhere = [];
    const unitParams = [];
    if (plan.district) { unitWhere.push('district = ?'); unitParams.push(plan.district); }
    unitWhere.push('status = ?'); unitParams.push('ACTIVE');
    const unitClause = unitWhere.length ? `WHERE ${unitWhere.join(' AND ')}` : '';
    const [unitRows] = await conn.query(`SELECT * FROM shelter_units ${unitClause}`, unitParams);
    const units = unitRows.map(mapShelterUnit);

    const projWhere = [];
    const projParams = [];
    if (plan.district) { projWhere.push('district = ?'); projParams.push(plan.district); }
    projWhere.push('status = ?'); projParams.push('NORMAL');
    const projClause = projWhere.length ? `WHERE ${projWhere.join(' AND ')}` : '';
    const [projRows] = await conn.query(`SELECT * FROM projects ${projClause}`, projParams);
    const projects = projRows.map(mapProject);

    await conn.query('DELETE FROM allocation_results WHERE simulation_id = ?', [planId]);
    await conn.query('DELETE FROM simulation_summaries WHERE simulation_id = ?', [planId]);

    const result = allocateShelters({
      units,
      projects,
      maxDistance: plan.maxEvacuationDistance,
      perCapitaArea: plan.perCapitaArea,
      excludedProjectIds: plan.excludedProjectIds,
      excludedUnitIds: plan.excludedUnitIds,
    });

    for (const alloc of result.allocations) {
      await conn.query(
        `INSERT INTO allocation_results (simulation_id, shelter_unit_id, project_id, allocated_count,
          distance_meters, walk_minutes, is_uncovered, reason)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [planId, alloc.unitId, alloc.projectId || null, alloc.allocated,
         alloc.distance, alloc.walkMinutes, alloc.isUncovered ? 1 : 0, alloc.reason || ''],
      );
    }

    const details = {
      projectUsage: result.projectUsage,
      uncoveredList: result.uncoveredList,
    };

    await conn.query(
      `INSERT INTO simulation_summaries (simulation_id, total_units, total_population, allocated_population,
        uncovered_population, shelter_rate, total_projects, total_capacity, used_capacity, remaining_capacity,
        avg_distance, max_distance, result_details)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [planId, result.summary.totalUnits, result.summary.totalPopulation, result.summary.allocatedPopulation,
       result.summary.uncoveredPopulation, result.summary.shelterRate,
       result.summary.totalProjects, result.summary.totalCapacity, result.summary.usedCapacity, result.summary.remainingCapacity,
       result.summary.avgDistance, result.summary.maxDistance, JSON.stringify(details)],
    );

    await conn.query('UPDATE simulation_plans SET status = ?, updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?',
      ['COMPLETED', planId]);

    await conn.commit();

    return {
      plan: await getSimulationPlan(planId),
      summary: await getSimulationSummary(planId),
      allocations: await listAllocationResults(planId),
    };
  } catch (err) {
    await conn.rollback();
    await pool.query('UPDATE simulation_plans SET status = ? WHERE id = ?', ['FAILED', planId]);
    throw err;
  } finally {
    conn.release();
  }
}

/* ----------------------------- 区域掩蔽率统计 ----------------------------- */

async function getDistrictShelterStats(district) {
  const unitsWhere = district ? 'WHERE district = ? AND status = ?' : 'WHERE status = ?';
  const unitsParams = district ? [district, 'ACTIVE'] : ['ACTIVE'];
  const [unitRows] = await pool.query(
    `SELECT COUNT(*) AS unit_count, SUM(population) AS total_population FROM shelter_units ${unitsWhere}`,
    unitsParams,
  );

  const projWhere = district ? 'WHERE district = ? AND status = ?' : 'WHERE status = ?';
  const projParams = district ? [district, 'NORMAL'] : ['NORMAL'];
  const [projRows] = await pool.query(
    `SELECT COUNT(*) AS project_count, SUM(capacity) AS total_capacity, SUM(shelter_area_sqm) AS total_shelter_area
     FROM projects ${projWhere}`,
    projParams,
  );

  const totalUnits = Number(unitRows[0].unit_count) || 0;
  const totalPopulation = Number(unitRows[0].total_population) || 0;
  const totalProjects = Number(projRows[0].project_count) || 0;
  const totalCapacity = Number(projRows[0].total_capacity) || 0;
  const totalShelterArea = projRows[0].total_shelter_area ? Number(projRows[0].total_shelter_area) : 0;

  return {
    district: district || '全市',
    totalUnits,
    totalPopulation,
    totalProjects,
    totalCapacity,
    totalShelterArea,
    canShelter: Math.min(totalPopulation, totalCapacity),
    shortage: Math.max(0, totalPopulation - totalCapacity),
    shelterRate: totalPopulation > 0
      ? Number(((Math.min(totalPopulation, totalCapacity) / totalPopulation) * 100).toFixed(2))
      : 0,
    capacitySurplus: Math.max(0, totalCapacity - totalPopulation),
  };
}

module.exports = {
  seed, isEmpty,
  findUserByUsername, getUser, listUsers, createUser,
  listProjects, getProject, findProjectByCode, createProject, updateProject, deleteProject,
  listEquipments, createEquipment,
  listInspections, createInspection,
  listShelterUnits, getShelterUnit, findShelterUnitByCode, createShelterUnit, updateShelterUnit, deleteShelterUnit,
  listSimulationPlans, getSimulationPlan, createSimulationPlan, updateSimulationPlan, deleteSimulationPlan,
  listAllocationResults, getSimulationSummary, executeSimulation,
  getDistrictShelterStats,
};
