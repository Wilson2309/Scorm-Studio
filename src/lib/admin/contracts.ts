import {z} from "zod";
import {workspaceId,workspaceStates} from "../workspace/contracts";
const count=z.number().int().nonnegative(),role=z.enum(["TEACHER","ADMIN"]);
export const adminRPCs=["admin_overview","admin_people","admin_activities","admin_change_role"] as const;
export type AdminRPC=typeof adminRPCs[number];
export const adminPaging=z.object({q:z.string().trim().max(100).default(""),page:z.coerce.number().int().min(1).max(10000).default(1),pageSize:z.coerce.number().int().min(1).max(25).default(10)});
export const peopleFilters=adminPaging.extend({role:z.enum(["ALL","TEACHER","ADMIN"]).default("ALL"),order:z.enum(["newest","oldest","name"]).default("newest")});
export const activityFilters=adminPaging.extend({status:z.enum(["ALL",...workspaceStates.options]).default("ALL"),owner:workspaceId.optional(),order:z.enum(["updated","newest","oldest"]).default("updated")});
export const overviewFilters=z.object({days:z.coerce.number().refine(v=>[7,30,90].includes(v)).default(30)});
export const personSchema=z.object({id:workspaceId,name:z.string(),email:z.string().nullable(),role,createdAt:z.string(),lastSignIn:z.string().nullable(),confirmed:z.boolean(),activities:count,quizzes:count});
export type AdminPerson=z.infer<typeof personSchema>;
export const peopleSchema=z.object({items:z.array(personSchema),total:count,page:count,pageSize:count,adminCount:count});
export const adminActivity=z.object({id:workspaceId,ownerId:workspaceId,ownerName:z.string(),title:z.string(),type:z.enum(["QUIZ","ROULETTE","TIMELINE","SIMULATION"]),status:workspaceStates,questions:count,revision:count,createdAt:z.string(),updatedAt:z.string(),deleting:z.boolean(),packageState:z.enum(["CURRENT","PROCESSING","NONE"]),issueCode:z.enum(["generation_failed","storage_unavailable","revision_conflict","operation_busy","package_invalid","package_obsolete","operation_failed"]).nullable()});
export const adminActivitiesSchema=z.object({items:z.array(adminActivity),total:count,page:count,pageSize:count});
export const overviewSchema=z.object({asOf:z.string(),days:count,since:z.string(),accounts:count,teachers:count,admins:count,activities:count,quizzes:count,pendingDrafts:count,failedActivities:count,preparing:count,currentPackages:count,
 period:z.object({createdActivities:count,completedGenerations:count,packagedSCORM:count,failedOperations:count}),storage:z.object({objects:count,measuredObjects:count,bytes:count,complete:z.boolean()}),
 recent:z.array(adminActivity.pick({id:true,title:true,ownerName:true,status:true,deleting:true,updatedAt:true,questions:true})),
 audit:z.array(z.object({id:workspaceId,actorId:workspaceId.nullable(),targetId:workspaceId,oldRole:role,newRole:role,reason:z.string(),source:z.enum(["APP","OPERATOR"]),createdAt:z.string()}))});
export const roleChangeSchema=z.object({role,expectedRole:role,requestId:workspaceId,reason:z.string().trim().min(10).max(300),confirmed:z.literal(true)}).strict();
export const roleResultSchema=z.object({id:workspaceId,changed:z.boolean(),replayed:z.boolean()});
