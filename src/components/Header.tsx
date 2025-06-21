import React, { useState } from 'react';
import { Search, Bell, Settings, User, Moon, Sun } from 'lucide-react';
import { useApp } from '../contexts/AppContext';

export default function Header() {
  const { state, dispatch } = useApp();
  const [searchQuery, setSearchQuery] = useState('');
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    // Implement search functionality
    console.log('Searching for:', searchQuery);
  };

  const toggleTheme = () => {
    dispatch({ type: 'TOGGLE_DARK_MODE' });
  };

  return (
    <header className={`${
      state.isDarkMode ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200'
    } border-b transition-colors duration-200`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <div className="flex items-center">
            <div className={`${
              state.isDarkMode ? 'bg-blue-600' : 'bg-blue-500'
            } rounded-lg p-2 mr-3`}>
              <div className="w-6 h-6 bg-white rounded-sm flex items-center justify-center">
                <div className="w-3 h-3 bg-blue-500 rounded-sm"></div>
              </div>
            </div>
            <h1 className={`text-xl font-bold ${
              state.isDarkMode ? 'text-white' : 'text-gray-900'
            }`}>
              SmartPlan
            </h1>
          </div>

          {/* Search Bar */}
          <div className="flex-1 max-w-lg mx-8">
            <form onSubmit={handleSearch} className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className={`h-5 w-5 ${
                  state.isDarkMode ? 'text-gray-400' : 'text-gray-400'
                }`} />
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`block w-full pl-10 pr-3 py-2 border rounded-lg leading-5 ${
                  state.isDarkMode 
                    ? 'bg-gray-800 border-gray-600 text-white placeholder-gray-400 focus:ring-blue-500 focus:border-blue-500' 
                    : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500 focus:ring-blue-500 focus:border-blue-500'
                } focus:outline-none focus:ring-1 transition-colors duration-200`}
                placeholder="Search events, tasks, or ask AI..."
              />
            </form>
          </div>

          {/* Right Side Actions */}
          <div className="flex items-center space-x-4">
            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className={`p-2 rounded-lg hover:bg-opacity-80 transition-colors duration-200 ${
                state.isDarkMode 
                  ? 'text-gray-300 hover:bg-gray-800' 
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {state.isDarkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>

            {/* Notifications */}
            <button className={`p-2 rounded-lg hover:bg-opacity-80 transition-colors duration-200 ${
              state.isDarkMode 
                ? 'text-gray-300 hover:bg-gray-800' 
                : 'text-gray-600 hover:bg-gray-100'
            }`}>
              <Bell className="h-5 w-5" />
            </button>

            {/* Settings */}
            <button className={`p-2 rounded-lg hover:bg-opacity-80 transition-colors duration-200 ${
              state.isDarkMode 
                ? 'text-gray-300 hover:bg-gray-800' 
                : 'text-gray-600 hover:bg-gray-100'
            }`}>
              <Settings className="h-5 w-5" />
            </button>

            {/* Profile */}
            <div className="relative">
              <button
                onClick={() => setShowProfileMenu(!showProfileMenu)}
                className="flex items-center space-x-2 p-1 rounded-lg hover:bg-opacity-80 transition-colors duration-200"
              >
                <img
                  src={state.user?.avatar}
                  alt={state.user?.name}
                  className="w-8 h-8 rounded-full object-cover"
                />
                <span className={`text-sm font-medium ${
                  state.isDarkMode ? 'text-white' : 'text-gray-900'
                }`}>
                  {state.user?.name}
                </span>
              </button>

              {showProfileMenu && (
                <div className={`absolute right-0 mt-2 w-48 rounded-lg shadow-lg py-1 z-50 ${
                  state.isDarkMode ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200'
                }`}>
                  <a href="#" className={`block px-4 py-2 text-sm hover:bg-opacity-80 transition-colors duration-200 ${
                    state.isDarkMode 
                      ? 'text-gray-300 hover:bg-gray-700' 
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}>
                    Profile Settings
                  </a>
                  <a href="#" className={`block px-4 py-2 text-sm hover:bg-opacity-80 transition-colors duration-200 ${
                    state.isDarkMode 
                      ? 'text-gray-300 hover:bg-gray-700' 
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}>
                    Preferences
                  </a>
                  <hr className={`my-1 ${state.isDarkMode ? 'border-gray-700' : 'border-gray-200'}`} />
                  <a href="#" className={`block px-4 py-2 text-sm hover:bg-opacity-80 transition-colors duration-200 ${
                    state.isDarkMode 
                      ? 'text-gray-300 hover:bg-gray-700' 
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}>
                    Sign Out
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}