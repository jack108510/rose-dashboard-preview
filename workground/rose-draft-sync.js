(function(root){
  class RoseDraftSync {
    constructor({send,snapshot,onState}){this.send=send;this.snapshot=snapshot;this.onState=onState;this.revision=null;this.saved='';this.tail=Promise.resolve();this.blocked=false;this.pending=0;}
    hydrate(revision,snapshot){this.revision=Number(revision||0);this.saved=JSON.stringify(snapshot);this.blocked=false;}
    dirty(){return this.saved!==JSON.stringify(this.snapshot());}
    save(snapshot=this.snapshot(),action='save'){
      const frozen=JSON.parse(JSON.stringify(snapshot));this.pending++;
      const task=this.tail.catch(()=>{}).then(async()=>{
        if(this.blocked)throw Error('A newer draft exists. Reload to review both versions before saving.');
        if(this.revision===null)throw Error('Wait for your account to finish loading before saving.');
        this.onState('Saving…');
        try{const result=await this.send({action,draft:frozen,baseRevision:this.revision});this.revision=result.revision;this.saved=JSON.stringify(frozen);this.onState(this.dirty()?'Draft unsaved':'Draft saved');return result;}
        catch(error){if(error.status===409)this.blocked=true;this.onState(this.blocked?'Draft conflict — reload to review':'Draft local — not synced');throw error;}
      });
      this.tail=task;task.finally(()=>{this.pending--}).catch(()=>{});return task;
    }
  }
  root.RoseDraftSync=RoseDraftSync;
})(typeof window==='undefined'?globalThis:window);
