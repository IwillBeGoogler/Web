import type { ClusterProfile } from './types';
import { kafkaProfile } from './kafka';
import { postgresqlProfile } from './postgresql';
import { mysqlProfile } from './mysql';
import { mongodbProfile } from './mongodb';
import { redisProfile } from './redis';
import { cassandraProfile } from './cassandra';
import { elasticsearchProfile } from './elasticsearch';
import { clickhouseProfile } from './clickhouse';
import { rabbitmqProfile } from './rabbitmq';
import { quorumProfile } from './quorum';
import { SPEC_PROFILES } from '../specs';

export const PROFILES = [kafkaProfile, postgresqlProfile, mysqlProfile, mongodbProfile, redisProfile, cassandraProfile, elasticsearchProfile, clickhouseProfile, rabbitmqProfile, quorumProfile, ...SPEC_PROFILES] as unknown as ClusterProfile[];
export const getProfile = (id: string): ClusterProfile | undefined => PROFILES.find((p) => p.id === id);
