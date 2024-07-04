-- Pull in the wezterm API
local wezterm = require 'wezterm'

-- This will hold the configuration.
local config = wezterm.config_builder()

config.enable_scroll_bar = true
-- config.font = wezterm.font 'BlexMono Nerd Font'
config.color_scheme = 'TokyoNight'

-- and finally, return the configuration to wezterm
return config
