import React, { useState, useEffect } from 'react';
import { Meteor } from 'meteor/meteor';
import SearchForm from './components/SearchForm';
import RepositoryResult from './components/RepositoryResult';
import { SearchResult } from '../api/types';

export const App: React.FC = () => {
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-refresh quando o repositório está "generating"
  useEffect(() => {
    if (!searchResult?.found || !searchResult.repository) return;
    
    const repository = searchResult.repository;
    
    // Se está generating, aguardar 5 segundos e fazer refresh
    if (repository.status === 'generating') {
      const refreshTimeout = setTimeout(() => {
        handleSearch(searchResult.parsedUrl.fullUrl);
      }, 5000); // 5 segundos
      
      return () => {
        clearTimeout(refreshTimeout);
      };
    }
  }, [searchResult?.repository?.status]);

  const handleSearch = (githubUrl: string) => {
    setLoading(true);
    setError(null);
    setSearchResult(null);

    Meteor.call('repositories.search', githubUrl, (error: Meteor.Error, result: SearchResult) => {
      setLoading(false);
      
      if (error) {
        setError(error.reason || 'Search failed');
        return;
      }
      
      setSearchResult(result);
    });
  };

  const handleGenerateRSS = (githubUrl: string) => {
    setLoading(true);
    
    Meteor.call('repositories.create', githubUrl, (error: any) => {
      setLoading(false);
      
      if (error) {
        alert(`Failed to create repository: ${error.message}`);
        return;
      }
      
      handleSearch(githubUrl);
    });
  };

    const handleForceGenerate = (repositoryId: string) => {
    Meteor.call('repositories.generateRSS', repositoryId, (error: any) => {
      if (error) {
        alert(`Failed to generate RSS: ${error.message}`);
        return;
      }
      
      if (searchResult?.parsedUrl?.fullUrl) {
        handleSearch(searchResult.parsedUrl.fullUrl);
      }
    });
  };

  return (
    <div style={{ 
      maxWidth: '900px', 
      margin: '0 auto', 
      padding: '40px 20px',
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' 
    }}>
      <header style={{ textAlign: 'center', marginBottom: '40px' }}>
        <h1 style={{ 
          color: '#2c3e50', 
          fontSize: '2.8em', 
          marginBottom: '15px',
          fontWeight: '600',
          letterSpacing: '-0.02em'
        }}>
          GitHub RSS Generator
        </h1>
        <p style={{ 
          color: '#7f8c8d', 
          fontSize: '1.2em',
          lineHeight: '1.6',
          maxWidth: '600px',
          margin: '0 auto'
        }}>
          Generate RSS feeds for GitHub repositories including Issues, Pull Requests, Discussions, and Releases
        </p>
      </header>

      <SearchForm 
        onSearch={handleSearch}
        loading={loading}
      />

      {error && (
        <div style={{
          background: '#fee',
          border: '1px solid #fcc',
          borderRadius: '12px',
          padding: '20px',
          margin: '20px 0',
          color: '#c33',
          fontSize: '1em'
        }}>
          <strong>⚠️ Error:</strong> {error}
        </div>
      )}

      {searchResult && (
        <RepositoryResult 
          result={searchResult}
          onGenerateRSS={handleGenerateRSS}
          onForceGenerate={handleForceGenerate}
          loading={loading}
        />
      )}

      <footer style={{ 
        textAlign: 'center', 
        marginTop: '80px',
        padding: '40px 0',
        borderTop: '1px solid #ecf0f1',
        color: '#95a5a6',
        fontSize: '0.9em'
      }}>
        <p>
          🚀 Built with <strong>MeteorJS</strong> + <strong>TypeScript</strong> + <strong>React</strong>
        </p>
        <p style={{ marginTop: '10px' }}>
          Enter any GitHub repository URL to check for existing RSS feeds or generate new ones
        </p>
      </footer>
    </div>
  );
};
