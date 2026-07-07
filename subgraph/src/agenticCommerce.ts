import {
  JobCreated as JobCreatedEvent,
} from "../generated/AgenticCommerce/AgenticCommerce";
import { Job, JobCreated } from "../generated/schema";

export function handleJobCreated(event: JobCreatedEvent): void {
  let id = event.params.jobId.toString();

  let job = new Job(id);
  job.jobId = event.params.jobId;
  job.client = event.params.client;
  job.provider = event.params.provider;
  job.evaluator = event.params.evaluator;
  job.description = "";
  job.expiredAt = event.params.expiredAt;
  job.status = "open";
  job.createdAt = event.block.timestamp;
  job.txHash = event.transaction.hash;
  job.save();

  let ev = new JobCreated(event.transaction.hash.toHexString() + "-" + event.logIndex.toString());
  ev.jobId = event.params.jobId;
  ev.client = event.params.client;
  ev.provider = event.params.provider;
  ev.evaluator = event.params.evaluator;
  ev.expiredAt = event.params.expiredAt;
  ev.timestamp = event.block.timestamp;
  ev.txHash = event.transaction.hash;
  ev.save();
}
