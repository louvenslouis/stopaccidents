-- A comment owner can react just like any other registered reader. Keep the
-- ownership restriction on flags, and preserve the rest of the deployed RPC.
do $migration$
declare
 definition text := pg_get_functiondef('private.write_report_comment(text,uuid,text,uuid,text,uuid)'::regprocedure);
 old_guard text := 'if target.author_id=auth.uid() then raise exception ''Own comment'' using errcode=''42501''; end if;';
 new_guard text := 'if p_action=''flag'' and target.author_id=auth.uid() then raise exception ''Own comment'' using errcode=''42501''; end if;';
begin
 if position(new_guard in definition)>0 then return; end if;
 if position(old_guard in definition)=0 then raise exception 'Comment ownership guard not found'; end if;
 execute replace(definition,old_guard,new_guard);
end;
$migration$;
