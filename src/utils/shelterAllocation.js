'use strict';

const WALK_SPEED_MPM = 80;

function toRad(deg) {
  return deg * Math.PI / 180;
}

function haversineDistance(lat1, lon1, lat2, lon2) {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return null;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function parseProtectionLevel(level) {
  if (level == null) return 99;
  const s = String(level).trim();
  const m = s.match(/^(\d+)([A-Za-z]?)$/);
  if (!m) return 99;
  const num = parseInt(m[1], 10);
  const suffix = m[2].toUpperCase();
  return suffix === 'B' ? num + 0.5 : num;
}

function allocateShelters({
  units,
  projects,
  maxDistance = 800,
  perCapitaArea = 1.0,
  excludedProjectIds = [],
  excludedUnitIds = [],
}) {
  const excludedProjects = new Set(excludedProjectIds || []);
  const excludedUnits = new Set(excludedUnitIds || []);

  const validUnits = units
    .filter(u => !excludedUnits.has(u.id) && u.status === 'ACTIVE' && u.population > 0)
    .sort((a, b) => a.priority - b.priority);

  const validProjects = projects
    .filter(p => !excludedProjects.has(p.id) && p.status === 'NORMAL' && p.longitude != null && p.latitude != null);

  const projectCapacity = new Map();
  for (const p of validProjects) {
    const cap = perCapitaArea > 0
      ? Math.floor(p.shelterAreaSqm / perCapitaArea)
      : p.capacity;
    projectCapacity.set(p.id, {
      project: p,
      remaining: Math.max(0, cap),
      total: cap,
      allocated: 0,
    });
  }

  const results = [];

  for (const unit of validUnits) {
    if (unit.longitude == null || unit.latitude == null) {
      results.push({
        unitId: unit.id,
        unitName: unit.name,
        projectId: null,
        allocated: 0,
        distance: null,
        walkMinutes: null,
        isUncovered: true,
        reason: '待掩蔽单元缺少经纬度坐标',
      });
      continue;
    }

    const candidates = [];
    for (const entry of projectCapacity.values()) {
      const dist = haversineDistance(
        unit.latitude, unit.longitude,
        entry.project.latitude, entry.project.longitude
      );
      if (dist != null && dist <= maxDistance) {
        candidates.push({
          projectId: entry.project.id,
          projectName: entry.project.name,
          protectionLevel: entry.project.protectionLevel,
          protectionValue: parseProtectionLevel(entry.project.protectionLevel),
          distance: dist,
          remaining: entry.remaining,
        });
      }
    }

    candidates.sort((a, b) => {
      if (a.protectionValue !== b.protectionValue) {
        return a.protectionValue - b.protectionValue;
      }
      return a.distance - b.distance;
    });

    let remainingPopulation = unit.population;

    for (const cand of candidates) {
      if (remainingPopulation <= 0) break;
      const entry = projectCapacity.get(cand.projectId);
      if (!entry || entry.remaining <= 0) continue;

      const assign = Math.min(remainingPopulation, entry.remaining);
      entry.remaining -= assign;
      entry.allocated += assign;
      remainingPopulation -= assign;

      results.push({
        unitId: unit.id,
        unitName: unit.name,
        projectId: cand.projectId,
        projectName: cand.projectName,
        allocated: assign,
        distance: Number(cand.distance.toFixed(2)),
        walkMinutes: Number((cand.distance / WALK_SPEED_MPM).toFixed(1)),
        isUncovered: false,
        reason: '',
      });
    }

    if (remainingPopulation > 0) {
      const hasCandidates = candidates.length > 0;
      results.push({
        unitId: unit.id,
        unitName: unit.name,
        projectId: null,
        allocated: remainingPopulation,
        distance: null,
        walkMinutes: null,
        isUncovered: true,
        reason: hasCandidates
          ? `周边掩体均已满员，仍有 ${remainingPopulation} 人无法安置`
          : `疏散半径 ${maxDistance} 米内无可用掩体`,
      });
    }
  }

  const projectUsage = [];
  for (const entry of projectCapacity.values()) {
    projectUsage.push({
      projectId: entry.project.id,
      projectName: entry.project.name,
      protectionLevel: entry.project.protectionLevel,
      totalCapacity: entry.total,
      allocated: entry.allocated,
      remaining: entry.remaining,
      occupancyRate: entry.total > 0
        ? Number(((entry.allocated / entry.total) * 100).toFixed(2))
        : 0,
    });
  }

  const totalPopulation = validUnits.reduce((sum, u) => sum + u.population, 0);
  const allocatedPopulation = results
    .filter(r => !r.isUncovered)
    .reduce((sum, r) => sum + r.allocated, 0);
  const uncoveredPopulation = results
    .filter(r => r.isUncovered)
    .reduce((sum, r) => sum + r.allocated, 0);

  const allocatedResults = results.filter(r => !r.isUncovered && r.distance != null);
  const avgDistance = allocatedResults.length > 0
    ? Number((allocatedResults.reduce((s, r) => s + r.distance, 0) / allocatedResults.length).toFixed(2))
    : null;
  const maxDistanceUsed = allocatedResults.length > 0
    ? Number(Math.max(...allocatedResults.map(r => r.distance)).toFixed(2))
    : null;

  const totalCapacity = projectUsage.reduce((sum, p) => sum + p.totalCapacity, 0);
  const usedCapacity = projectUsage.reduce((sum, p) => sum + p.allocated, 0);
  const remainingCapacity = totalCapacity - usedCapacity;

  const uncoveredList = results
    .filter(r => r.isUncovered)
    .map(r => ({
      unitId: r.unitId,
      unitName: r.unitName,
      uncoveredCount: r.allocated,
      reason: r.reason,
    }));

  return {
    allocations: results,
    projectUsage,
    uncoveredList,
    summary: {
      totalUnits: validUnits.length,
      totalPopulation,
      allocatedPopulation,
      uncoveredPopulation,
      shelterRate: totalPopulation > 0
        ? Number(((allocatedPopulation / totalPopulation) * 100).toFixed(2))
        : 0,
      totalProjects: validProjects.length,
      totalCapacity,
      usedCapacity,
      remainingCapacity,
      avgDistance,
      maxDistance: maxDistanceUsed,
    },
  };
}

module.exports = {
  haversineDistance,
  parseProtectionLevel,
  allocateShelters,
};
