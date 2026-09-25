#!/usr/bin/env python3
"""Package only built code, synthetic examples, and documentation; never real packets."""
from pathlib import Path
import hashlib, json, zipfile
root=Path(__file__).resolve().parents[1]
out=root/'dist/ats-handoff-1.0.1.zip'
entries={}
for f in (root/'dist/extension').rglob('*'):
    if f.is_file(): entries['extension/'+f.relative_to(root/'dist/extension').as_posix()]=f
for f in ['README.md','TEST.md','requirements.txt','handoff-packet.schema.json','bin/apply.py']:
    entries[f]=root/f
entries['capture-form-state.js']=root/'dist/capture-form-state.js'
entries['dist/restore-fields-template.js']=root/'dist/restore-fields-template.js'
for folder,destination in [('dist/capture-chunks','capture-chunks'),('handoffs/examples','handoffs/examples')]:
    for f in (root/folder).rglob('*'):
        if f.is_file():entries[destination+'/'+f.relative_to(root/folder).as_posix()]=f
with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as archive:
    for name,file in sorted(entries.items()):
        if file.is_symlink():raise RuntimeError('Refuse symlink in release')
        archive.writestr(name,file.read_bytes())
manifest={'version':'1.0.1','schema_version':'1.0','artifact':out.name,'sha256':hashlib.sha256(out.read_bytes()).hexdigest(),'size':out.stat().st_size,'files':len(entries),'telemetry':False,'tracker_sync':False,'cookie_transfer':False}
(root/'dist/release.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps(manifest,indent=2))
