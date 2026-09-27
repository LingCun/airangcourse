CREATE TRIGGER families_add_owner AFTER INSERT ON families
FOR EACH ROW INSERT INTO family_members (family_id,user_id,role) VALUES (NEW.id,NEW.created_by,'owner');
