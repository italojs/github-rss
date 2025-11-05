import { Mongo } from 'meteor/mongo';
import { Meteor } from 'meteor/meteor';
import { Repository } from '../types';

// Collection for storing GitHub repository RSS data
export const Repositories = new Mongo.Collection<Repository>('repositories');

if (Meteor.isServer) {
  // Create indexes for better performance
  Meteor.startup(async () => {
    await Repositories.createIndexAsync({ url: 1 }, { unique: true });
    await Repositories.createIndexAsync({ owner: 1, repo: 1 });
    await Repositories.createIndexAsync({ status: 1 });
    await Repositories.createIndexAsync({ lastUpdate: 1 });
    
    console.log('📊 MongoDB indexes created for repositories collection');
  });
}