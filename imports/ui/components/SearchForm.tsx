import React, { useState } from 'react';

interface SearchFormProps {
  onSearch: (url: string) => void;
  loading: boolean;
}

const SearchForm: React.FC<SearchFormProps> = ({ onSearch, loading }) => {
  const [url, setUrl] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    
    // Basic GitHub URL validation
    const githubPattern = /^https?:\/\/(www\.)?github\.com\/[^\/]+\/[^\/]+/;
    if (!githubPattern.test(url.trim())) {
      alert('Please enter a valid GitHub repository URL');
      return;
    }
    
    onSearch(url.trim());
  };

  const handleExampleClick = (exampleUrl: string) => {
    setUrl(exampleUrl);
  };

  return (
    <div style={{ marginBottom: '40px' }}>
      <form onSubmit={handleSubmit} style={{ marginBottom: '30px' }}>
        <div style={{ 
          display: 'flex', 
          gap: '12px',
          flexWrap: 'wrap',
          justifyContent: 'center'
        }}>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://github.com/owner/repository"
            style={{
              flex: '1',
              minWidth: '350px',
              maxWidth: '500px',
              padding: '16px 20px',
              border: '2px solid #e1e8ed',
              borderRadius: '12px',
              fontSize: '16px',
              outline: 'none',
              transition: 'all 0.2s ease',
              backgroundColor: 'white',
              boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
            }}
            onFocus={(e) => {
              e.target.style.borderColor = '#3498db';
              e.target.style.boxShadow = '0 4px 12px rgba(52, 152, 219, 0.15)';
            }}
            onBlur={(e) => {
              e.target.style.borderColor = '#e1e8ed';
              e.target.style.boxShadow = '0 2px 4px rgba(0,0,0,0.05)';
            }}
            disabled={loading}
          />
          
          <button
            type="submit"
            disabled={loading || !url.trim()}
            style={{
              padding: '16px 32px',
              background: loading || !url.trim() ? '#bdc3c7' : 'linear-gradient(135deg, #3498db, #2980b9)',
              color: 'white',
              border: 'none',
              borderRadius: '12px',
              fontSize: '16px',
              cursor: loading || !url.trim() ? 'not-allowed' : 'pointer',
              fontWeight: '600',
              transition: 'all 0.2s ease',
              boxShadow: loading || !url.trim() ? 'none' : '0 4px 12px rgba(52, 152, 219, 0.3)',
              minWidth: '120px'
            }}
            onMouseEnter={(e) => {
              if (!loading && url.trim()) {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 6px 20px rgba(52, 152, 219, 0.4)';
              }
            }}
            onMouseLeave={(e) => {
              if (!loading && url.trim()) {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(52, 152, 219, 0.3)';
              }
            }}
          >
            {loading ? '🔍 Searching...' : '🔍 Search'}
          </button>
        </div>
      </form>

      <div style={{ 
        textAlign: 'center'
      }}>
        <p style={{ 
          marginBottom: '15px',
          color: '#7f8c8d',
          fontSize: '14px',
          fontWeight: '500'
        }}>
          Try these popular repositories:
        </p>
        <div style={{ 
          display: 'flex', 
          gap: '12px', 
          justifyContent: 'center',
          flexWrap: 'wrap'
        }}>
          {[
            { url: 'https://github.com/nodejs/node', label: 'nodejs/node' },
            { url: 'https://github.com/facebook/react', label: 'facebook/react' },
            { url: 'https://github.com/microsoft/vscode', label: 'microsoft/vscode' },
            { url: 'https://github.com/vercel/next.js', label: 'vercel/next.js' }
          ].map(({ url: exampleUrl, label }) => (
            <button
              key={exampleUrl}
              onClick={() => handleExampleClick(exampleUrl)}
              disabled={loading}
              style={{
                background: 'white',
                border: '1px solid #e1e8ed',
                borderRadius: '8px',
                padding: '8px 16px',
                color: '#3498db',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontSize: '13px',
                fontWeight: '500',
                transition: 'all 0.2s ease',
                opacity: loading ? 0.6 : 1
              }}
              onMouseEnter={(e) => {
                if (!loading) {
                  e.currentTarget.style.backgroundColor = '#f8fafc';
                  e.currentTarget.style.borderColor = '#3498db';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                }
              }}
              onMouseLeave={(e) => {
                if (!loading) {
                  e.currentTarget.style.backgroundColor = 'white';
                  e.currentTarget.style.borderColor = '#e1e8ed';
                  e.currentTarget.style.transform = 'translateY(0)';
                }
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default SearchForm;