import { Mongo } from 'meteor/mongo';
import { Meteor } from 'meteor/meteor';
import { GithubRepo } from './types';

// Collection for storing GitHub repository RSS data
export const GithubRepoCollection = new Mongo.Collection<GithubRepo>('githubRepo');

if (Meteor.isServer) {
  // Create indexes for better performance
  Meteor.startup(async () => {
    await GithubRepoCollection.createIndexAsync({ url: 1 }, { unique: true });
    await GithubRepoCollection.createIndexAsync({ owner: 1, repo: 1 });
    
    console.log('📊 MongoDB indexes created for repositories collection');
  });
}

export async function findRepositoryById(repositoryId: string): Promise<GithubRepo | undefined> {
  return GithubRepoCollection.findOneAsync({ _id: repositoryId });
}

export async function findRepositoryByOwnerAndRepo(owner: string, repo: string): Promise<GithubRepo | undefined> {
  return GithubRepoCollection.findOneAsync({ owner: owner.toLowerCase(), repo: repo.toLowerCase() });
}

export async function insertRepository(repository: GithubRepo): Promise<string> {
  return GithubRepoCollection.insertAsync(repository);
}

export async function updateRepositoryStatus(
  repositoryId: string,
  status: GithubRepo['status'],
  additionalFields: Partial<GithubRepo> = {}
): Promise<number> {
  const updateData = {
    status,
    lastUpdate: new Date(),
    ...additionalFields
  };

  return GithubRepoCollection.updateAsync(repositoryId, { $set: updateData });
}
