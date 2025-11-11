import React from 'react';
import { Meteor } from 'meteor/meteor';
import { useTracker } from 'meteor/react-meteor-data';
import { Repositories } from '../../api/repositories/collection';
import { SearchResult, FeedType } from '../../api/types';
import FeedCard from './FeedCard';

interface RepositoryResultProps {
  result: SearchResult;
  onGenerateRSS: (githubUrl: string) => void;
  onForceGenerate?: (repositoryId: string) => void;
  loading: boolean;
}

interface FeedTypeDisplay {
  key: FeedType;
  label: string;
  icon: string;
}

const RepositoryResult: React.FC<RepositoryResultProps> = ({ result, onGenerateRSS, onForceGenerate, loading }) => {
  const { found, repository, parsedUrl } = result;

  const feedTypes: FeedTypeDisplay[] = [
    { key: 'issues', label: 'Issues', icon: '🐛' },
    { key: 'pullRequests', label: 'Pull Requests', icon: '🔄' },
    { key: 'discussions', label: 'Discussions', icon: '💬' },
    { key: 'releases', label: 'Releases', icon: '🚀' }
  ];

  const liveRepository = useTracker(() => {
    if (!repository?._id) return repository;
    return Repositories.findOne(repository._id) || repository;
  }, [repository?._id]);

  const currentRepo = liveRepository || repository;

  const getDirectUrl = (repositoryId: string, feedType: string): Promise<{url: string | null, wasRegenerated: boolean}> => {
    return new Promise((resolve) => {
      Meteor.call('repositories.getFeedsWithCache', repositoryId, (error: any, result: {feeds: Record<FeedType, string>, wasRegenerated: boolean}) => {
        if (error) {
          resolve({url: null, wasRegenerated: false});
        } else {
          const url = result.feeds[feedType as FeedType] || null;
          resolve({url, wasRegenerated: result.wasRegenerated});
        }
      });
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ready': return '#27ae60';
      case 'generating': return '#f39c12';
      case 'pending': return '#95a5a6';
      case 'error': return '#e74c3c';
      default: return '#95a5a6';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'ready': return 'Ready';
      case 'generating': return 'Generating...';
      case 'pending': return 'Pending';
      case 'error': return 'Error';
      default: return 'Unknown';
    }
  };

  if (!found) {
    return (
      <div style={{
        background: 'linear-gradient(135deg, #f8fafc, #f1f5f9)',
        border: '1px solid #e1e8ed',
        borderRadius: '16px',
        padding: '40px',
        textAlign: 'center',
        margin: '30px 0',
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.05)'
      }}>
        <div style={{ fontSize: '64px', marginBottom: '20px' }}>📁</div>
        <h3 style={{ 
          color: '#2c3e50', 
          marginBottom: '15px',
          fontSize: '1.5em',
          fontWeight: '600'
        }}>
          No RSS feeds found
        </h3>
        <p style={{ 
          color: '#7f8c8d', 
          marginBottom: '30px',
          fontSize: '1.1em',
          lineHeight: '1.5'
        }}>
          We don't have RSS feeds for <strong>{parsedUrl.owner}/{parsedUrl.repo}</strong> yet.
          <br />
          Click below to generate feeds for Issues, PRs, Discussions, and Releases.
        </p>
        <button
          onClick={() => onGenerateRSS(parsedUrl.fullUrl)}
          disabled={loading}
          style={{
            padding: '16px 32px',
            background: loading 
              ? '#bdc3c7' 
              : 'linear-gradient(135deg, #27ae60, #229954)',
            color: 'white',
            border: 'none',
            borderRadius: '12px',
            fontSize: '16px',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontWeight: '600',
            transition: 'all 0.2s ease',
            boxShadow: loading ? 'none' : '0 4px 12px rgba(39, 174, 96, 0.3)'
          }}
          onMouseEnter={(e) => {
            if (!loading) {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 6px 20px rgba(39, 174, 96, 0.4)';
            }
          }}
          onMouseLeave={(e) => {
            if (!loading) {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(39, 174, 96, 0.3)';
            }
          }}
        >
          {loading ? '⏳ Creating...' : '✨ Generate RSS Feeds'}
        </button>
      </div>
    );
  }

  if (!currentRepo) return null;

  return (
    <>
      <div style={{
        background: 'white',
        border: '1px solid #e1e8ed',
        borderRadius: '16px',
        padding: '40px',
        margin: '30px 0',
        boxShadow: '0 8px 25px rgba(0,0,0,0.08)'
      }}>
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          marginBottom: '30px',
          flexWrap: 'wrap',
          gap: '15px'
        }}>
          <div>
            <h3 style={{ 
              color: '#2c3e50', 
              margin: '0 0 8px 0',
              fontSize: '1.6em',
              fontWeight: '600'
            }}>
              📦 {currentRepo.owner}/{currentRepo.repo}
            </h3>
            <p style={{ 
              margin: 0, 
              color: '#7f8c8d',
              fontSize: '0.95em'
            }}>
              {currentRepo.lastUpdate && (
                <span>Last updated: {new Date(currentRepo.lastUpdate).toLocaleDateString()} at {new Date(currentRepo.lastUpdate).toLocaleTimeString()}</span>
              )}
            </p>
          </div>
        
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '8px 16px',
          borderRadius: '20px',
          backgroundColor: `${getStatusColor(currentRepo.status)}15`,
          border: `1px solid ${getStatusColor(currentRepo.status)}40`
        }}>
          <span
            style={{
              display: 'inline-block',
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: getStatusColor(currentRepo.status)
            }}
          />
          <span style={{ 
            fontSize: '0.9em',
            color: getStatusColor(currentRepo.status),
            fontWeight: '600'
          }}>
            {getStatusLabel(currentRepo.status)}
          </span>
        </div>
      </div>

      {currentRepo.error && (
        <div style={{
          background: '#fee',
          border: '1px solid #fcc',
          borderRadius: '8px',
          padding: '15px',
          marginBottom: '25px',
          color: '#c33',
          fontSize: '0.95em'
        }}>
          <strong>⚠️ Error:</strong> {currentRepo.error}
        </div>
      )}

      <div style={{ marginBottom: '25px' }}>
        <h4 style={{ 
          color: '#2c3e50', 
          marginBottom: '20px',
          fontSize: '1.2em',
          fontWeight: '600'
        }}>
          📡 RSS Feeds:
        </h4>
        
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '16px'
        }}>
          {feedTypes.map(({ key, label, icon }) => {
            const feedUrl = currentRepo.feeds?.[key as keyof typeof currentRepo.feeds];
            const isAvailable = !!feedUrl;
            const isGenerating = currentRepo.status === 'generating';
            
            return (
              <FeedCard
                key={key}
                title={label}
                icon={icon}
                isAvailable={isAvailable}
                isGenerating={isGenerating}
                repositoryId={currentRepo._id}
                feedType={key}
                onGetDirectUrl={getDirectUrl}
              />
            );
          })}
        </div>
      </div>

      {currentRepo.status === 'pending' && (
        <div style={{
          background: 'linear-gradient(135deg, #fff3cd, #ffeaa7)',
          border: '1px solid #f39c12',
          borderRadius: '8px',
          padding: '20px',
          fontSize: '0.95em',
          color: '#856404'
        }}>
          <div style={{ marginBottom: '15px' }}>
            <strong>⏳ RSS generation is queued.</strong> Feeds will be generated automatically by our background process. 
            Check back in a few minutes to see the results.
          </div>
          
          {onForceGenerate && currentRepo._id && (
            <button
              onClick={() => onForceGenerate(currentRepo._id!)}
              style={{
                padding: '10px 20px',
                background: 'linear-gradient(135deg, #f39c12, #e67e22)',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                cursor: 'pointer',
                fontWeight: '600',
                transition: 'all 0.2s ease',
                boxShadow: '0 2px 8px rgba(243, 156, 18, 0.3)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-1px)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(243, 156, 18, 0.4)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(243, 156, 18, 0.3)';
              }}
            >
              🚀 Generate Now
            </button>
          )}
        </div>
      )}
    </div>
    </>
  );
};

export default RepositoryResult;