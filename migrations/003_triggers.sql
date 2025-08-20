-- Triggers for B2C Nutrition App

-- Function to update search text and tsvector for recipes
CREATE OR REPLACE FUNCTION recipes_update_search()
RETURNS TRIGGER AS $$
BEGIN
    -- Build search text from multiple fields
    NEW.search_text := COALESCE(NEW.title, '') || ' ' || 
                       COALESCE(NEW.description, '') || ' ' ||
                       array_to_string(NEW.cuisines, ' ') || ' ' ||
                       array_to_string(NEW.diet_tags, ' ') || ' ' ||
                       array_to_string(NEW.flags, ' ');
    
    -- Create tsvector for full-text search
    NEW.tsv := to_tsvector('english', NEW.search_text);
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to maintain search fields on recipes
CREATE TRIGGER trig_recipes_update_search
    BEFORE INSERT OR UPDATE ON recipes
    FOR EACH ROW EXECUTE FUNCTION recipes_update_search();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers to automatically update updated_at columns
CREATE TRIGGER trig_recipes_updated_at
    BEFORE UPDATE ON recipes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trig_user_recipes_updated_at
    BEFORE UPDATE ON user_recipes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trig_user_profiles_updated_at
    BEFORE UPDATE ON user_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trig_recipe_reports_updated_at
    BEFORE UPDATE ON recipe_reports
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to automatically set published_at when status changes to published
CREATE OR REPLACE FUNCTION set_published_at()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'published' AND (OLD.status IS NULL OR OLD.status != 'published') THEN
        NEW.published_at = NOW();
    ELSIF NEW.status != 'published' THEN
        NEW.published_at = NULL;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to set published_at on recipes
CREATE TRIGGER trig_recipes_published_at
    BEFORE INSERT OR UPDATE ON recipes
    FOR EACH ROW EXECUTE FUNCTION set_published_at();
