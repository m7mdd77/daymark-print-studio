import{ROLES,requireRule,validatePlan}from'./domain.js';
export class CompanyRunner{
 constructor(ledger,infer){this.ledger=ledger;this.infer=infer;}
 async run({companyId,jobId,scenario='paper-delay',progress=async()=>{}}){requireRule(['paper-delay','sales-slip'].includes(scenario),'scenario','Unknown scenario.');const prior=this.ledger.startJob(jobId,companyId);if(prior.duplicate){requireRule(prior.result,'pending','That day has already started.');return prior.result;}
 try{let c=this.ledger.load(companyId);requireRule(!c.state.closed,'closed','The week is already closed.');if(!c.state.scenario)this.ledger.event(companyId,'system','scenario',{name:scenario});
 const report=async()=>{try{await progress(this.ledger.load(companyId));}catch{}};
 for(const role of ROLES){this.ledger.event(companyId,role,'role_started',{});await report();const before=this.ledger.load(companyId).state,version=before.version;
 try{const result=await this.infer(role,before);validatePlan(result.plan,role);requireRule(this.ledger.load(companyId).state.version===version,'stale','The role read an older ledger.');this.ledger.trace(companyId,{role,day:before.day,version,model:result.model,usage:result.usage,plan:result.plan});let actions=result.plan.actions;
 if(role==='sales'&&before.day===0&&scenario==='sales-slip')actions=[{type:'accept_lead',leadId:'L202',price:9000}];
 for(const action of actions){try{this.ledger.event(companyId,role,'action',{action});}catch(e){this.ledger.event(companyId,role,'rejected',{action,code:e.code||'refused',reason:e.message,injected:role==='sales'&&before.day===0&&scenario==='sales-slip'});}}
 this.ledger.event(companyId,role,'role_finished',{reason:result.plan.reason,model:result.model,usage:result.usage});}
 catch(error){const allowed=['provider_timeout','client_request_failed','invalid_output','authority','shape','allowance','offline','lease','stale'];this.ledger.event(companyId,role,'role_failed',{code:allowed.includes(error.code)?error.code:'unavailable'});}await report();}
 this.ledger.event(companyId,'system','day_closed',{});return this.ledger.finishJob(jobId,companyId);
 }catch(e){this.ledger.finishJob(jobId,companyId);throw e;}}
 resolve(companyId,id,choice){const c=this.ledger.load(companyId);requireRule(!c.busy,'busy','Wait for the day to finish.');return this.ledger.event(companyId,'owner','owner_decision',{id,choice});}
}
