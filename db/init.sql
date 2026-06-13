-- 容器首次初始化：仅建表。
-- 种子数据（含用户密码哈希）由应用启动时运行时播种，避免把哈希硬编码进 SQL。

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
    shelter_area_sqm DECIMAL(12,2) NOT NULL DEFAULT 0,
    capacity        INT          NOT NULL DEFAULT 0,
    entrance_count  INT          NOT NULL DEFAULT 0,
    evacuation_capacity INT      NOT NULL DEFAULT 0,
    longitude       DECIMAL(11,8) NULL,
    latitude        DECIMAL(10,8) NULL,
    created_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uk_projects_code (code),
    KEY idx_projects_status (status),
    KEY idx_projects_district (district),
    KEY idx_projects_location (longitude, latitude)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS shelter_units (
    id          BIGINT       NOT NULL AUTO_INCREMENT,
    code        VARCHAR(48)  NOT NULL,
    name        VARCHAR(128) NOT NULL,
    unit_type   VARCHAR(32)  NOT NULL DEFAULT 'RESIDENTIAL',
    population  INT          NOT NULL DEFAULT 0,
    priority    INT          NOT NULL DEFAULT 10,
    district    VARCHAR(64)  NOT NULL DEFAULT '',
    address     VARCHAR(255) NOT NULL DEFAULT '',
    longitude   DECIMAL(11,8) NULL,
    latitude    DECIMAL(10,8) NULL,
    description VARCHAR(500) NOT NULL DEFAULT '',
    status      VARCHAR(16)  NOT NULL DEFAULT 'ACTIVE',
    created_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uk_shelter_units_code (code),
    KEY idx_shelter_units_district (district),
    KEY idx_shelter_units_location (longitude, latitude)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS simulation_plans (
    id                  BIGINT       NOT NULL AUTO_INCREMENT,
    name                VARCHAR(128) NOT NULL,
    description         VARCHAR(500) NOT NULL DEFAULT '',
    district            VARCHAR(64)  NOT NULL DEFAULT '',
    bounds              JSON         NULL,
    per_capita_area     DECIMAL(6,2) NOT NULL DEFAULT 1.00,
    max_evacuation_distance INT      NOT NULL DEFAULT 800,
    excluded_project_ids JSON        NULL,
    excluded_unit_ids   JSON         NULL,
    status              VARCHAR(16)  NOT NULL DEFAULT 'DRAFT',
    created_by          BIGINT       NULL,
    created_at          DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at          DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    KEY idx_simulation_plans_district (district),
    KEY idx_simulation_plans_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS allocation_results (
    id                  BIGINT       NOT NULL AUTO_INCREMENT,
    simulation_id       BIGINT       NOT NULL,
    shelter_unit_id     BIGINT       NOT NULL,
    project_id          BIGINT       NULL,
    allocated_count     INT          NOT NULL DEFAULT 0,
    distance_meters     DECIMAL(10,2) NULL,
    walk_minutes        DECIMAL(6,1) NULL,
    is_uncovered        TINYINT(1)   NOT NULL DEFAULT 0,
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

CREATE TABLE IF NOT EXISTS simulation_summaries (
    id                  BIGINT       NOT NULL AUTO_INCREMENT,
    simulation_id       BIGINT       NOT NULL UNIQUE,
    total_units         INT          NOT NULL DEFAULT 0,
    total_population    INT          NOT NULL DEFAULT 0,
    allocated_population INT         NOT NULL DEFAULT 0,
    uncovered_population INT         NOT NULL DEFAULT 0,
    shelter_rate        DECIMAL(5,2) NOT NULL DEFAULT 0.00,
    total_projects      INT          NOT NULL DEFAULT 0,
    total_capacity      INT          NOT NULL DEFAULT 0,
    used_capacity       INT          NOT NULL DEFAULT 0,
    remaining_capacity  INT          NOT NULL DEFAULT 0,
    avg_distance        DECIMAL(8,2) NULL,
    max_distance        DECIMAL(8,2) NULL,
    result_details      JSON         NULL,
    created_at          DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    CONSTRAINT fk_summary_simulation FOREIGN KEY (simulation_id) REFERENCES simulation_plans (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
