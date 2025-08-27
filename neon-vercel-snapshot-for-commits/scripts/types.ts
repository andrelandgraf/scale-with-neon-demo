// Neon API Types
// Based on the official Neon API documentation

export interface NeonBranch {
  id: string;
  project_id: string;
  parent_id?: string;
  parent_lsn?: string;
  parent_timestamp?: string;
  name: string;
  current_state: string;
  pending_state?: string;
  state_changed_at: string;
  logical_size?: number;
  creation_source: string;
  primary: boolean;
  default: boolean;
  protected: boolean;
  cpu_used_sec: number;
  compute_time_seconds: number;
  active_time_seconds: number;
  written_data_bytes: number;
  data_transfer_bytes: number;
  created_at: string;
  updated_at: string;
  created_by: {
    name: string;
    image: string;
  };
  init_source: string;
  expire_at?: string;
}

export interface NeonEndpoint {
  host: string;
  id: string;
  project_id: string;
  branch_id: string;
  autoscaling_limit_min_cu: number;
  autoscaling_limit_max_cu: number;
  region_id: string;
  type: "read_write" | "read_only";
  current_state: string;
  pending_state?: string;
  settings: Record<string, any>;
  pooler_enabled: boolean;
  pooler_mode: string;
  disabled: boolean;
  passwordless_access: boolean;
  creation_source: string;
  created_at: string;
  updated_at: string;
  proxy_host: string;
  suspend_timeout_seconds: number;
  provisioner: string;
}

export interface NeonOperation {
  id: string;
  project_id: string;
  branch_id: string;
  endpoint_id?: string;
  action: string;
  status: string;
  failures_count: number;
  created_at: string;
  updated_at: string;
  total_duration_ms: number;
}

export interface NeonRole {
  branch_id: string;
  name: string;
  protected: boolean;
  created_at: string;
  updated_at: string;
}

export interface NeonDatabase {
  id: number;
  branch_id: string;
  name: string;
  owner_name: string;
  created_at: string;
  updated_at: string;
}

export interface ConnectionParameters {
  database: string;
  password: string;
  role: string;
  host: string;
  pooler_host: string;
}

export interface ConnectionUri {
  connection_uri: string;
  connection_parameters: ConnectionParameters;
}

export interface ListBranchesResponse {
  branches: NeonBranch[];
  annotations: Record<string, any>;
  pagination: {
    sort_by: string;
    sort_order: string;
  };
}

export interface CreateBranchResponse {
  branch: NeonBranch;
  endpoints: NeonEndpoint[];
  operations: NeonOperation[];
  roles: NeonRole[];
  databases: NeonDatabase[];
  connection_uris: ConnectionUri[];
}

export interface CreateBranchRequest {
  endpoints: Array<{
    type: "read_write" | "read_only";
    pooler_enabled?: boolean;
  }>;
  branch: {
    parent_id: string;
    name?: string;
    expire_at?: string;
  };
}

// Snapshot-related types
export interface NeonSnapshot {
  id: string;
  project_id: string;
  branch_id: string;
  name: string;
  created_at: string;
  expires_at: string;
  status: "active" | "expired" | "creating" | "error";
  size_bytes?: number;
  logical_size?: number;
  timestamp?: string;
  lsn?: string;
}

export interface CreateSnapshotRequest {
  name: string;
  timestamp?: string;
  lsn?: string;
  expires_at?: string;
}

export interface CreateSnapshotResponse {
  snapshot: NeonSnapshot;
  operations: NeonOperation[];
}

export interface ListSnapshotsResponse {
  snapshots: NeonSnapshot[];
}

export interface RestoreSnapshotRequest {
  name?: string;
  finalize_restore?: boolean;
  target_branch_id?: string;
  expire_at?: string;
}

export interface RestoreSnapshotResponse {
  branch: NeonBranch;
  operations: NeonOperation[];
}

// API error response type
export interface NeonApiError {
  message: string;
  code?: string;
  details?: any;
}
