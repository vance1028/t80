-- 人防工程管理平台 - 表结构（MySQL）

-- 用户（登录与角色）
CREATE TABLE IF NOT EXISTS users (
    id            BIGINT       NOT NULL AUTO_INCREMENT,
    username      VARCHAR(64)  NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name          VARCHAR(64)  NOT NULL DEFAULT '',
    role          VARCHAR(16)  NOT NULL DEFAULT 'INSPECTOR',
    department    VARCHAR(128) NOT NULL DEFAULT '',
    status        VARCHAR(16)  NOT NULL DEFAULT 'ACTIVE',
    created_at    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uk_users_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 人防工程档案
CREATE TABLE IF NOT EXISTS projects (
    id              BIGINT       NOT NULL AUTO_INCREMENT,
    code            VARCHAR(48)  NOT NULL,
    name            VARCHAR(128) NOT NULL,
    type            VARCHAR(32)  NOT NULL DEFAULT 'COMBINED',
    protection_level VARCHAR(16) NOT NULL DEFAULT '6',
    area_sqm        DECIMAL(12,2) NOT NULL DEFAULT 0,
    address         VARCHAR(255) NOT NULL DEFAULT '',
    district        VARCHAR(64)  NOT NULL DEFAULT '',
    peacetime_use   VARCHAR(128) NOT NULL DEFAULT '',
    status          VARCHAR(16)  NOT NULL DEFAULT 'NORMAL',
    completed_at    DATE         NULL,
    -- 掩蔽能力相关字段
    shelter_area_sqm DECIMAL(12,2) NOT NULL DEFAULT 0 COMMENT '实际可用于人员掩蔽的面积',
    capacity        INT          NOT NULL DEFAULT 0 COMMENT '额定容纳人数（按人均掩蔽标准折算）',
    entrance_count  INT          NOT NULL DEFAULT 0 COMMENT '出入口数量',
    evacuation_capacity INT      NOT NULL DEFAULT 0 COMMENT '疏散能力（人/分钟）',
    longitude       DECIMAL(11,8) NULL COMMENT '经度（WGS84）',
    latitude        DECIMAL(10,8) NULL COMMENT '纬度（WGS84）',
    created_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uk_projects_code (code),
    KEY idx_projects_status (status),
    KEY idx_projects_district (district),
    KEY idx_projects_location (longitude, latitude)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 待掩蔽单元：按小区/单位划分的待掩蔽人群
CREATE TABLE IF NOT EXISTS shelter_units (
    id          BIGINT       NOT NULL AUTO_INCREMENT,
    code        VARCHAR(48)  NOT NULL COMMENT '单元编号',
    name        VARCHAR(128) NOT NULL COMMENT '单元名称（如XX小区、XX单位）',
    unit_type   VARCHAR(32)  NOT NULL DEFAULT 'RESIDENTIAL' COMMENT '类型：RESIDENTIAL-小区, ENTERPRISE-单位, SCHOOL-学校, HOSPITAL-医院',
    population  INT          NOT NULL DEFAULT 0 COMMENT '需掩蔽人数',
    priority    INT          NOT NULL DEFAULT 10 COMMENT '优先级（数字越小优先级越高，1-医院/学校等重点）',
    district    VARCHAR(64)  NOT NULL DEFAULT '',
    address     VARCHAR(255) NOT NULL DEFAULT '',
    longitude   DECIMAL(11,8) NULL COMMENT '经度',
    latitude    DECIMAL(10,8) NULL COMMENT '纬度',
    description VARCHAR(500) NOT NULL DEFAULT '',
    status      VARCHAR(16)  NOT NULL DEFAULT 'ACTIVE',
    created_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uk_shelter_units_code (code),
    KEY idx_shelter_units_district (district),
    KEY idx_shelter_units_location (longitude, latitude)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 推演方案：存储每次推演的参数配置
CREATE TABLE IF NOT EXISTS simulation_plans (
    id                  BIGINT       NOT NULL AUTO_INCREMENT,
    name                VARCHAR(128) NOT NULL COMMENT '方案名称',
    description         VARCHAR(500) NOT NULL DEFAULT '',
    district            VARCHAR(64)  NOT NULL DEFAULT '' COMMENT '推演区域',
    bounds              JSON         NULL COMMENT '区域边界（多边形经纬度数组）',
    per_capita_area     DECIMAL(6,2) NOT NULL DEFAULT 1.00 COMMENT '人均掩蔽标准（平方米）',
    max_evacuation_distance INT      NOT NULL DEFAULT 800 COMMENT '最远疏散距离（米）',
    excluded_project_ids JSON        NULL COMMENT '排除的工程ID（如检修中的）',
    excluded_unit_ids   JSON         NULL COMMENT '排除的单元ID',
    status              VARCHAR(16)  NOT NULL DEFAULT 'DRAFT' COMMENT 'DRAFT-草稿, RUNNING-执行中, COMPLETED-已完成, FAILED-失败',
    created_by          BIGINT       NULL,
    created_at          DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at          DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    KEY idx_simulation_plans_district (district),
    KEY idx_simulation_plans_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 分配结果：存储单次推演的具体分配明细
CREATE TABLE IF NOT EXISTS allocation_results (
    id                  BIGINT       NOT NULL AUTO_INCREMENT,
    simulation_id       BIGINT       NOT NULL COMMENT '推演方案ID',
    shelter_unit_id     BIGINT       NOT NULL COMMENT '待掩蔽单元ID',
    project_id          BIGINT       NULL COMMENT '分配的人防工程ID（NULL表示未分配）',
    allocated_count     INT          NOT NULL DEFAULT 0 COMMENT '分配人数',
    distance_meters     DECIMAL(10,2) NULL COMMENT '疏散距离（米，球面距离）',
    walk_minutes        DECIMAL(6,1) NULL COMMENT '步行时间（分钟，按80米/分钟估算）',
    is_uncovered        TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '是否为未覆盖盲区',
    reason              VARCHAR(200) NOT NULL DEFAULT '',
    created_at          DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    KEY idx_allocation_simulation (simulation_id),
    KEY idx_allocation_unit (shelter_unit_id),
    KEY idx_allocation_project (project_id),
    KEY idx_allocation_uncovered (simulation_id, is_uncovered),
    CONSTRAINT fk_allocation_simulation FOREIGN KEY (simulation_id) REFERENCES simulation_plans (id) ON DELETE CASCADE,
    CONSTRAINT fk_allocation_unit FOREIGN KEY (shelter_unit_id) REFERENCES shelter_units (id),
    CONSTRAINT fk_allocation_project FOREIGN KEY (project_id) REFERENCES projects (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 推演统计表：存储每次推演的汇总结果（冗余便于查询）
CREATE TABLE IF NOT EXISTS simulation_summaries (
    id                  BIGINT       NOT NULL AUTO_INCREMENT,
    simulation_id       BIGINT       NOT NULL UNIQUE,
    total_units         INT          NOT NULL DEFAULT 0 COMMENT '待掩蔽单元总数',
    total_population    INT          NOT NULL DEFAULT 0 COMMENT '需掩蔽总人数',
    allocated_population INT         NOT NULL DEFAULT 0 COMMENT '已分配人数',
    uncovered_population INT         NOT NULL DEFAULT 0 COMMENT '未覆盖（缺口）人数',
    shelter_rate        DECIMAL(5,2) NOT NULL DEFAULT 0.00 COMMENT '掩蔽率（已分配/需掩蔽*100）',
    total_projects      INT          NOT NULL DEFAULT 0 COMMENT '可用掩体总数',
    total_capacity      INT          NOT NULL DEFAULT 0 COMMENT '总额定容量',
    used_capacity       INT          NOT NULL DEFAULT 0 COMMENT '已用容量',
    remaining_capacity  INT          NOT NULL DEFAULT 0 COMMENT '剩余容量',
    avg_distance        DECIMAL(8,2) NULL COMMENT '平均疏散距离',
    max_distance        DECIMAL(8,2) NULL COMMENT '最大疏散距离',
    result_details      JSON         NULL COMMENT '详细结果（各掩体使用情况、盲区列表）',
    created_at          DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    CONSTRAINT fk_summary_simulation FOREIGN KEY (simulation_id) REFERENCES simulation_plans (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 工程内的设备设施
CREATE TABLE IF NOT EXISTS equipments (
    id          BIGINT       NOT NULL AUTO_INCREMENT,
    project_id  BIGINT       NOT NULL,
    name        VARCHAR(128) NOT NULL,
    category    VARCHAR(32)  NOT NULL DEFAULT 'OTHER',
    model       VARCHAR(64)  NOT NULL DEFAULT '',
    install_date DATE        NULL,
    status      VARCHAR(16)  NOT NULL DEFAULT 'NORMAL',
    created_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    KEY idx_equip_project (project_id),
    CONSTRAINT fk_equip_project FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 检查/维护记录
CREATE TABLE IF NOT EXISTS inspections (
    id           BIGINT       NOT NULL AUTO_INCREMENT,
    project_id   BIGINT       NOT NULL,
    inspector_id BIGINT       NULL,
    inspect_date DATE         NOT NULL,
    type         VARCHAR(16)  NOT NULL DEFAULT 'ROUTINE',
    result       VARCHAR(16)  NOT NULL DEFAULT 'PASS',
    issues       VARCHAR(1000) NOT NULL DEFAULT '',
    created_at   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    KEY idx_insp_project (project_id),
    KEY idx_insp_date (inspect_date),
    CONSTRAINT fk_insp_project FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE,
    CONSTRAINT fk_insp_user FOREIGN KEY (inspector_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
