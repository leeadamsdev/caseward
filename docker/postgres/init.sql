-- Separate owners and connection grants protect development data from database tests.
CREATE ROLE caseward LOGIN PASSWORD 'caseward_local';
CREATE DATABASE caseward OWNER caseward;
REVOKE CONNECT ON DATABASE caseward FROM PUBLIC;

CREATE ROLE caseward_testing LOGIN PASSWORD 'caseward_testing_local';
CREATE DATABASE caseward_testing OWNER caseward_testing;
REVOKE CONNECT ON DATABASE caseward_testing FROM PUBLIC;
