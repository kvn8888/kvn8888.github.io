#!/usr/bin/env python3
"""Standalone producer; existing apply-kit can delegate these subcommands here."""
import argparse, datetime, json, os, pathlib, sys, uuid
ROOT = pathlib.Path(__file__).resolve().parents[1]

def validate(packet):
    try:
        import jsonschema
    except ImportError:
        raise ValueError('Install the validator: python3 -m pip install -r requirements.txt')
    if packet.get('schema_version') != '1.0':
        raise ValueError('Unsupported schema version; this producer supports 1.0. Upgrade for newer formats.')
    if len(json.dumps(packet, ensure_ascii=False).encode()) > 2 * 1024 * 1024:
        raise ValueError('Packet exceeds 2 MiB')
    schema = json.loads((ROOT / 'handoff-packet.schema.json').read_text())
    checker = jsonschema.FormatChecker()
    @checker.checks('date-time')
    def timestamp(value):
        if not isinstance(value, str): return True
        import re
        if not re.search(r'T.*(?:Z|[+-]\d{2}:\d{2})$', value, re.I): return False
        try: datetime.datetime.fromisoformat(value.replace('Z', '+00:00').replace('z', '+00:00')); return True
        except ValueError: return False
    @checker.checks('uri')
    def uri(value):
        if not isinstance(value, str): return True
        from urllib.parse import urlparse
        try:
            u = urlparse(value)
            return u.scheme in ['http','https'] and bool(u.hostname) and u.port != 0 and not any(c.isspace() for c in value)
        except ValueError: return False
    validator = jsonschema.Draft7Validator(schema, format_checker=checker)
    errors = list(validator.iter_errors(packet))
    if errors:
        raise ValueError('; '.join('/'.join(map(str, e.path)) + ': failed ' + str(e.validator) + ' validation' for e in errors[:5]))
    from urllib.parse import urlparse, parse_qs
    for value in [packet['application_url']] + [f['frame_url'] for f in packet.get('fields', []) if f.get('frame_url')]:
        parsed = urlparse(value)
        if parsed.username or parsed.password or any(k.lower() in ['access_token','id_token','refresh_token','password','otp','code','session','sessionid','csrf'] for k in parse_qs(parsed.query)):
            raise ValueError('Use reusable application URLs without authentication/session parameters')
    return packet

def read(path):
    source = pathlib.Path(path)
    if source.stat().st_size > 2 * 1024 * 1024:
        raise ValueError('Input exceeds 2 MiB')
    return json.loads(source.read_text())

def write_private(path, value):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as stream:
        json.dump(value, stream, ensure_ascii=False, indent=2)
        stream.write('\n')

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    check = commands.add_parser('handoff-validate'); check.add_argument('path')
    write = commands.add_parser('handoff-write')
    for flag in ['url','ats','blocker','company','role','fields','profile-overlay','capture','notes']:
        write.add_argument('--'+flag, required=flag=='url', default='unknown' if flag=='ats' else 'captcha' if flag=='blocker' else None)
    write.add_argument('--fill-js', action='store_true', help='Emit a trusted local DevTools restore script')
    write.add_argument('-o','--output')
    write.add_argument('--output-dir', default='/workspace/job-apps/handoffs')
    args=parser.parse_args()
    if args.command=='handoff-validate':
        packet=validate(read(args.path));print(json.dumps({'valid':True,'id':packet['id']}));return
    packet={'schema_version':'1.0','id':str(uuid.uuid4()),'created_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'application_url':args.url,'status':'captcha_blocked' if args.blocker=='captcha' else 'ready_for_human','ats':args.ats,'blocker':args.blocker,'fields':[],'agent':{'source':'apply-kit-handoff','box_capture':True}}
    for field in ['company','role']:
        if getattr(args,field):packet[field]=getattr(args,field)
    if args.fields:packet['fields']=read(args.fields)
    if args.capture:
        capture=read(args.capture);packet['fields']=capture.get('fields',[]);packet['notes']=capture.get('warnings',[])
    if args.profile_overlay:packet['profile_overlay']=read(args.profile_overlay)
    if args.notes:packet.setdefault('notes',[]).append(args.notes)
    validate(packet)
    destination=pathlib.Path(args.output) if args.output else pathlib.Path(args.output_dir)/(packet['id']+'.json')
    write_private(destination,packet)
    index=destination.parent/'index.jsonl';fd=os.open(index,os.O_WRONLY|os.O_APPEND|os.O_CREAT,0o600)
    with os.fdopen(fd,'a') as stream:
        import fcntl
        fcntl.flock(stream,fcntl.LOCK_EX)
        stream.write(json.dumps({'id':packet['id'],'path':str(destination),'url':packet['application_url'],'company':packet.get('company'),'status':packet['status'],'created_at':packet['created_at']})+'\n')
    if args.fill_js:
        from urllib.parse import urlparse
        u=urlparse(packet['application_url']); arguments={'action':'restore','walkFrames':True,'packet':packet,'expectedOrigin':u.scheme+'://'+u.netloc,'expectedPath':u.path+('?' + u.query if u.query else '')}
        template=(ROOT/'dist/restore-fields-template.js').read_text()
        output=destination.with_suffix('.fill.js')
        fd=os.open(output,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
        with os.fdopen(fd,'w') as stream:stream.write(template.replace('__HANDOFF_ARGUMENTS__',json.dumps(arguments,ensure_ascii=True)))
    print(json.dumps({'written':str(destination),'id':packet['id'],'index':str(index)}))
if __name__=='__main__':
    try:main()
    except Exception as error:print(str(error),file=sys.stderr);sys.exit(1)
