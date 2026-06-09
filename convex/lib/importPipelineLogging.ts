export type ImportPipelineLogEvent = {
  importId?: string;
  jobId?: string;
  step?: string;
  batchNumber?: number;
  rowsInBatch?: number;
  elapsedMs?: number;
  error?: string;
  message?: string;
};

/** Structured import-pipeline log line (grep for `"tag":"importPipeline"`). */
export function logImportPipelineEvent(event: ImportPipelineLogEvent): void {
  console.log(
    JSON.stringify({
      tag: "importPipeline",
      ts: Date.now(),
      ...event,
    }),
  );
}
