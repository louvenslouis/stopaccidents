-- PostgreSQL LEAST/GREATEST ignore NULL arguments: do not turn an absent GPS
-- coordinate into distance zero when finding events or checking reward proximity.
alter function private.report_distance(double precision,double precision,double precision,double precision) strict;
