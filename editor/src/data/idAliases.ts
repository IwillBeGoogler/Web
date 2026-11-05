/** Old catalog ids that were merged into a canonical item. Saved diagrams / .sdd files keep loading (see serialization). */
export const ID_ALIASES: Record<string, string> = {
  'aws-compute-optimizer-198': 'aws-compute-optimizer',
  'aws-amazon-kinesis-video-streams-244': 'aws-amazon-kinesis-video-streams',
  'aws-amazon-managed-workflows-for-apache-airflow': 'aws-amazon-mwaa',
};
export const resolveId = <T extends string | undefined>(id: T): T => (id && ID_ALIASES[id] ? (ID_ALIASES[id] as T) : id);
