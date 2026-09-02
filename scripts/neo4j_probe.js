#!/usr/bin/env node
/* Neo4j 连接探针：直连（不走 HTTP 代理，bolt+TLS），输出真实错误。 */
const neo4j = require('neo4j-driver');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const URI = process.env.NEO4J_URI || '';
const USER = process.env.NEO4J_USERNAME || '';
const PASS = process.env.NEO4J_PASSWORD || '';

console.log(`URI: ${URI}`);
console.log(`USER: ${USER}`);

const driver = neo4j.driver(URI, neo4j.auth.basic(USER, PASS), {
  connectionTimeout: 15000,
});
driver.verifyConnectivity()
  .then(() => { console.log('✓ 连接成功'); return driver.close(); })
  .catch((e) => {
    console.error('✗ 连接失败:', e.message);
    console.error('  code:', e.code || 'n/a');
    console.error('  stack(前3行):', (e.stack || '').split('\n').slice(0, 3).join(' | '));
    return driver.close();
  });
