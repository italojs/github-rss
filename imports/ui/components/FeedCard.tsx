import React, { useState } from 'react';

interface FeedCardProps {
  title: string;
  icon: string;
  feedUrl?: string;
  isAvailable: boolean;
  isGenerating: boolean;
  repositoryId?: string;
  feedType?: string;
  onGetPresignedUrl?: (repositoryId: string, feedType: string) => Promise<string | null>;
}

const FeedCard: React.FC<FeedCardProps> = ({ 
  title, 
  icon, 
  feedUrl, 
  isAvailable, 
  isGenerating,
  repositoryId,
  feedType,
  onGetPresignedUrl
}) => {
  const [isLoadingUrl, setIsLoadingUrl] = useState(false);

  const handleViewXML = async () => {
    if (!isAvailable || !repositoryId || !feedType || !onGetPresignedUrl) {
      // Fallback to direct URL if no presigned URL function provided
      if (feedUrl) {
        window.open(feedUrl, '_blank');
      }
      return;
    }

    setIsLoadingUrl(true);
    console.log(`🔗 Requesting presigned URL for ${repositoryId}/${feedType}...`);
    
    try {
      const presignedUrl = await onGetPresignedUrl(repositoryId, feedType);
      
      if (presignedUrl) {
        console.log(`✅ Opening presigned URL: ${presignedUrl.substring(0, 60)}...`);
        window.open(presignedUrl, '_blank');
      } else {
        console.log('⚠️ No presigned URL generated, using fallback');
        if (feedUrl) {
          window.open(feedUrl, '_blank');
        }
      }
    } catch (error: any) {
      console.error('❌ Failed to get presigned URL:', error.message);
      // Fallback to direct URL
      if (feedUrl) {
        window.open(feedUrl, '_blank');
      }
    } finally {
      setIsLoadingUrl(false);
    }
  };

  return (
    <div
      style={{
        border: `2px solid ${isAvailable ? '#27ae60' : '#e1e8ed'}`,
        borderRadius: '12px',
        padding: '16px',
        background: isAvailable ? '#f8fff8' : '#fafbfc',
        transition: 'all 0.2s ease',
        minHeight: '80px',
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: '10px',
        marginBottom: '12px'
      }}>
        <span style={{ fontSize: '24px' }}>{icon}</span>
        <div>
          <span style={{ 
            fontWeight: '600',
            color: '#2c3e50',
            fontSize: '1em'
          }}>
            {title}
          </span>
        </div>
      </div>
      
      {isAvailable && (feedUrl || (repositoryId && feedType)) ? (
        <div>
          <button
            onClick={handleViewXML}
            disabled={isLoadingUrl}
            style={{
              color: isLoadingUrl ? '#95a5a6' : '#3498db',
              textDecoration: 'none',
              fontSize: '0.9em',
              fontWeight: '500',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              background: isLoadingUrl ? '#f5f5f5' : '#f0f8ff',
              borderRadius: '6px',
              border: `1px solid ${isLoadingUrl ? '#ddd' : '#3498db30'}`,
              transition: 'all 0.2s ease',
              cursor: isLoadingUrl ? 'not-allowed' : 'pointer'
            }}
            onMouseEnter={(e) => {
              if (!isLoadingUrl) {
                e.currentTarget.style.backgroundColor = '#e6f3ff';
                e.currentTarget.style.transform = 'translateY(-1px)';
              }
            }}
            onMouseLeave={(e) => {
              if (!isLoadingUrl) {
                e.currentTarget.style.backgroundColor = '#f0f8ff';
                e.currentTarget.style.transform = 'translateY(0)';
              }
            }}
          >
            {isLoadingUrl ? '🔗 Generating link...' : '📄 View XML Feed'}
          </button>
        </div>
      ) : (
        <div style={{ 
          color: '#95a5a6',
          fontSize: '0.9em',
          fontStyle: 'italic'
        }}>
          {isGenerating ? '⏳ Generating...' : '❌ Not available'}
        </div>
      )}
    </div>
  );
};

export default FeedCard;